using System.Runtime.InteropServices;

namespace PhantomCompanion.VirtualGamepad;

public sealed record DiscoveredHidDevice(
    string DevicePath,
    ushort VendorId,
    ushort ProductId,
    string ProductName,
    bool IsPhantomVirtualDevice);

public sealed record WindowsGamepadDiscoverySnapshot(
    int[] ActiveXInputSlots,
    IReadOnlyList<DiscoveredHidDevice> HidGamepads,
    bool PhantomHidEnumerated,
    string Summary);

public static class DeviceDiscovery
{
    public const ushort PhantomVendorId = 0x1209;
    public const ushort PhantomProductId = 0x7A3E;

    public static WindowsGamepadDiscoverySnapshot ProbeWindowsDevices()
    {
        if (!OperatingSystem.IsWindows())
        {
            return new WindowsGamepadDiscoverySnapshot(
                Array.Empty<int>(),
                Array.Empty<DiscoveredHidDevice>(),
                false,
                "Windows HID/XInput enumeration requires Windows 10/11.");
        }

        var xinputSlots = ProbeXInputSlots();
        var hidDevices = EnumerateHidGamepads();
        bool phantomFound = hidDevices.Any(d => d.IsPhantomVirtualDevice);

        string summary = phantomFound
            ? $"Phantom HID Gamepad enumerated in Windows (VID_{PhantomVendorId:X4} PID_{PhantomProductId:X4})."
            : xinputSlots.Length > 0
                ? $"Phantom HID not found yet; {xinputSlots.Length} XInput controller slot(s) active."
                : "No Phantom virtual controller detected in Windows HID/XInput stack.";

        return new WindowsGamepadDiscoverySnapshot(xinputSlots, hidDevices, phantomFound, summary);
    }

    private static int[] ProbeXInputSlots()
    {
        var active = new List<int>();
        for (uint idx = 0; idx < 4; idx++)
        {
            try
            {
                if (XInputGetState(idx, out _) == 0)
                {
                    active.Add((int)idx);
                }
            }
            catch
            {
                break;
            }
        }
        return active.ToArray();
    }

    private static List<DiscoveredHidDevice> EnumerateHidGamepads()
    {
        var results = new List<DiscoveredHidDevice>();
        HidD_GetHidGuid(out Guid hidGuid);

        IntPtr devInfo = SetupDiGetClassDevsW(
            ref hidGuid,
            null,
            IntPtr.Zero,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);

        if (devInfo == IntPtr.Zero || devInfo == new IntPtr(-1))
            return results;

        try
        {
            var ifaceData = new SP_DEVICE_INTERFACE_DATA
            {
                cbSize = Marshal.SizeOf<SP_DEVICE_INTERFACE_DATA>()
            };

            uint index = 0;
            while (SetupDiEnumDeviceInterfaces(devInfo, IntPtr.Zero, ref hidGuid, index++, ref ifaceData))
            {
                SetupDiGetDeviceInterfaceDetailW(devInfo, ref ifaceData, IntPtr.Zero, 0, out int requiredSize, IntPtr.Zero);
                if (requiredSize <= 4) continue;

                IntPtr detailBuf = Marshal.AllocHGlobal(requiredSize);
                try
                {
                    // cbSize on 64-bit Windows SP_DEVICE_INTERFACE_DETAIL_DATA_W is 8, on 32-bit is 6
                    Marshal.WriteInt32(detailBuf, IntPtr.Size == 8 ? 8 : 6);
                    if (!SetupDiGetDeviceInterfaceDetailW(devInfo, ref ifaceData, detailBuf, requiredSize, out _, IntPtr.Zero))
                        continue;

                    string path = Marshal.PtrToStringUni(detailBuf + 4) ?? string.Empty;
                    if (string.IsNullOrEmpty(path)) continue;

                    using var handle = CreateFileW(
                        path,
                        0, // Metadata query only (no exclusive read/write lock required)
                        FILE_SHARE_READ | FILE_SHARE_WRITE,
                        IntPtr.Zero,
                        OPEN_EXISTING,
                        0,
                        IntPtr.Zero);

                    if (handle.IsInvalid) continue;

                    var attrs = new HIDD_ATTRIBUTES { Size = Marshal.SizeOf<HIDD_ATTRIBUTES>() };
                    if (!HidD_GetAttributes(handle.DangerousGetHandle(), ref attrs))
                        continue;

                    bool isPhantom = attrs.VendorID == PhantomVendorId && attrs.ProductID == PhantomProductId;
                    string prodName = ReadProductString(handle.DangerousGetHandle());
                    if (isPhantom || prodName.Contains("Gamepad", StringComparison.OrdinalIgnoreCase) || prodName.Contains("Controller", StringComparison.OrdinalIgnoreCase))
                    {
                        results.Add(new DiscoveredHidDevice(
                            path,
                            attrs.VendorID,
                            attrs.ProductID,
                            string.IsNullOrWhiteSpace(prodName) ? $"HID {attrs.VendorID:X4}:{attrs.ProductID:X4}" : prodName,
                            isPhantom));
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(detailBuf);
                }
            }
        }
        finally
        {
            SetupDiDestroyDeviceInfoList(devInfo);
        }

        return results;
    }

    private static string ReadProductString(IntPtr hidHandle)
    {
        byte[] buf = new byte[256];
        if (!HidD_GetProductString(hidHandle, buf, buf.Length))
            return string.Empty;

        int nullIdx = -1;
        for (int i = 0; i < buf.Length - 1; i += 2)
        {
            if (buf[i] == 0 && buf[i + 1] == 0)
            {
                nullIdx = i;
                break;
            }
        }
        int len = nullIdx >= 0 ? nullIdx : buf.Length;
        return System.Text.Encoding.Unicode.GetString(buf, 0, len).Trim();
    }

    #region Native Interop
    private const uint DIGCF_PRESENT = 0x02;
    private const uint DIGCF_DEVICEINTERFACE = 0x10;
    private const uint FILE_SHARE_READ = 0x01;
    private const uint FILE_SHARE_WRITE = 0x02;
    private const uint OPEN_EXISTING = 3;

    [StructLayout(LayoutKind.Sequential)]
    private struct XINPUT_GAMEPAD
    {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XINPUT_STATE
    {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SP_DEVICE_INTERFACE_DATA
    {
        public int cbSize;
        public Guid InterfaceClassGuid;
        public int Flags;
        public IntPtr Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HIDD_ATTRIBUTES
    {
        public int Size;
        public ushort VendorID;
        public ushort ProductID;
        public ushort VersionNumber;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState(uint dwUserIndex, out XINPUT_STATE pState);

    [DllImport("hid.dll")]
    private static extern void HidD_GetHidGuid(out Guid HidGuid);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_GetAttributes(IntPtr HidDeviceObject, ref HIDD_ATTRIBUTES Attributes);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_GetProductString(IntPtr HidDeviceObject, byte[] Buffer, int BufferLength);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevsW(ref Guid ClassGuid, string? Enumerator, IntPtr hwndParent, uint Flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiEnumDeviceInterfaces(IntPtr DeviceInfoSet, IntPtr DeviceInfoData, ref Guid InterfaceClassGuid, uint MemberIndex, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr DeviceInfoSet, ref SP_DEVICE_INTERFACE_DATA DeviceInterfaceData, IntPtr DeviceInterfaceDetailData, int DeviceInterfaceDetailDataSize, out int RequiredSize, IntPtr DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr DeviceInfoSet);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);
    #endregion
}
