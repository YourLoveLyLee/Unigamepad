#include "Driver.h"

NTSTATUS DriverEntry(
    _In_ PDRIVER_OBJECT DriverObject,
    _In_ PUNICODE_STRING RegistryPath)
{
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, PhantomEvtDeviceAdd);
    return WdfDriverCreate(DriverObject, RegistryPath, WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}

static VOID PhantomSubmitNeutralReport(_In_ PPHANTOM_DEVICE_CONTEXT ctx)
{
    PHANTOM_HID_INPUT_REPORT neutral = { 0 };
    HID_XFER_PACKET packet = { 0 };

    neutral.ReportId = PHANTOM_REPORT_ID;
    neutral.HatSwitch = 8;

    WdfSpinLockAcquire(ctx->ReportLock);
    ctx->LastReport = neutral;
    WdfSpinLockRelease(ctx->ReportLock);

    packet.reportBuffer = (PUCHAR)&neutral;
    packet.reportBufferLen = sizeof(neutral);
    packet.reportId = PHANTOM_REPORT_ID;

    if (ctx->VhfHandle != WDF_NO_HANDLE)
    {
        VhfReadReportSubmit(ctx->VhfHandle, &packet);
    }
}

NTSTATUS PhantomEvtDeviceAdd(
    _In_ WDFDRIVER Driver,
    _Inout_ PWDFDEVICE_INIT DeviceInit)
{
    UNREFERENCED_PARAMETER(Driver);

    NTSTATUS status;
    WDF_OBJECT_ATTRIBUTES deviceAttributes;
    WDF_PNPPOWER_EVENT_CALLBACKS pnpCallbacks;
    WDFDEVICE device;
    PPHANTOM_DEVICE_CONTEXT ctx;
    WDF_IO_QUEUE_CONFIG queueConfig;
    VHF_CONFIG vhfConfig;
    UNICODE_STRING symLink;

    WdfDeviceInitSetDeviceType(DeviceInit, FILE_DEVICE_UNKNOWN);
    WdfDeviceInitSetExclusive(DeviceInit, FALSE);

    WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pnpCallbacks);
    pnpCallbacks.EvtDeviceD0Exit = PhantomEvtDeviceD0Exit;
    WdfDeviceInitSetPnpPowerEventCallbacks(DeviceInit, &pnpCallbacks);

    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&deviceAttributes, PHANTOM_DEVICE_CONTEXT);
    deviceAttributes.EvtCleanupCallback = PhantomEvtDeviceCleanup;

    status = WdfDeviceCreate(&DeviceInit, &deviceAttributes, &device);
    if (!NT_SUCCESS(status)) return status;

    ctx = PhantomGetDeviceContext(device);
    RtlZeroMemory(ctx, sizeof(*ctx));
    ctx->LastReport.ReportId = PHANTOM_REPORT_ID;
    ctx->LastReport.HatSwitch = 8;

    status = WdfSpinLockCreate(WDF_NO_OBJECT_ATTRIBUTES, &ctx->ReportLock);
    if (!NT_SUCCESS(status)) return status;

    RtlInitUnicodeString(&symLink, PHANTOM_SYMBOLIC_LINK_NAME);
    status = WdfDeviceCreateSymbolicLink(device, &symLink);
    if (!NT_SUCCESS(status)) return status;

    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&queueConfig, WdfIoQueueDispatchSequential);
    queueConfig.EvtIoDeviceControl = PhantomEvtIoDeviceControl;
    status = WdfIoQueueCreate(device, &queueConfig, WDF_NO_OBJECT_ATTRIBUTES, WDF_NO_HANDLE);
    if (!NT_SUCCESS(status)) return status;

    VHF_CONFIG_INIT(
        &vhfConfig,
        WdfDeviceWdmGetDeviceObject(device),
        sizeof(G_PhantomHidReportDescriptor),
        (PUCHAR)G_PhantomHidReportDescriptor);

    vhfConfig.VendorID = PHANTOM_VID;
    vhfConfig.ProductID = PHANTOM_PID;
    vhfConfig.VersionNumber = PHANTOM_VERSION;
    vhfConfig.VhfClientContext = ctx;

    status = VhfCreate(&vhfConfig, &ctx->VhfHandle);
    if (!NT_SUCCESS(status)) return status;

    status = VhfStart(ctx->VhfHandle);
    if (!NT_SUCCESS(status))
    {
        VhfDelete(ctx->VhfHandle, TRUE);
        ctx->VhfHandle = WDF_NO_HANDLE;
        return status;
    }

    return STATUS_SUCCESS;
}

VOID PhantomEvtIoDeviceControl(
    _In_ WDFQUEUE Queue,
    _In_ WDFREQUEST Request,
    _In_ size_t OutputBufferLength,
    _In_ size_t InputBufferLength,
    _In_ ULONG IoControlCode)
{
    UNREFERENCED_PARAMETER(OutputBufferLength);

    WDFDEVICE device = WdfIoQueueGetDevice(Queue);
    PPHANTOM_DEVICE_CONTEXT ctx = PhantomGetDeviceContext(device);
    NTSTATUS status = STATUS_INVALID_DEVICE_REQUEST;
    PVOID inBuffer = NULL;
    size_t inLen = 0;

    if (IoControlCode == IOCTL_PHANTOM_SUBMIT_REPORT)
    {
        if (InputBufferLength != sizeof(PHANTOM_HID_INPUT_REPORT))
        {
            WdfRequestComplete(Request, STATUS_INVALID_BUFFER_SIZE);
            return;
        }

        status = WdfRequestRetrieveInputBuffer(Request, sizeof(PHANTOM_HID_INPUT_REPORT), &inBuffer, &inLen);
        if (NT_SUCCESS(status) && inBuffer != NULL)
        {
            PHANTOM_HID_INPUT_REPORT report;
            HID_XFER_PACKET packet = { 0 };

            RtlCopyMemory(&report, inBuffer, sizeof(report));
            report.ReportId = PHANTOM_REPORT_ID;

            WdfSpinLockAcquire(ctx->ReportLock);
            ctx->LastReport = report;
            WdfSpinLockRelease(ctx->ReportLock);

            packet.reportBuffer = (PUCHAR)&report;
            packet.reportBufferLen = sizeof(report);
            packet.reportId = PHANTOM_REPORT_ID;

            status = VhfReadReportSubmit(ctx->VhfHandle, &packet);
        }
    }
    else if (IoControlCode == IOCTL_PHANTOM_RESET_STATE)
    {
        PhantomSubmitNeutralReport(ctx);
        status = STATUS_SUCCESS;
    }

    WdfRequestComplete(Request, status);
}

NTSTATUS PhantomEvtDeviceD0Exit(
    _In_ WDFDEVICE Device,
    _In_ WDF_POWER_DEVICE_STATE TargetState)
{
    UNREFERENCED_PARAMETER(TargetState);
    PhantomSubmitNeutralReport(PhantomGetDeviceContext(Device));
    return STATUS_SUCCESS;
}

VOID PhantomEvtDeviceCleanup(_In_ WDFOBJECT DeviceObject)
{
    PPHANTOM_DEVICE_CONTEXT ctx = PhantomGetDeviceContext(DeviceObject);
    if (ctx->VhfHandle != WDF_NO_HANDLE)
    {
        VhfDelete(ctx->VhfHandle, TRUE);
        ctx->VhfHandle = WDF_NO_HANDLE;
    }
}
