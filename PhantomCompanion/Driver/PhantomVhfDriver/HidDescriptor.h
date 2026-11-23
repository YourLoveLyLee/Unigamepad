#pragma once
#include <ntddk.h>

#define PHANTOM_REPORT_ID 0x01
#define PHANTOM_HID_REPORT_SIZE 14

#pragma pack(push, 1)
typedef struct _PHANTOM_HID_INPUT_REPORT {
    UCHAR  ReportId;      // Must be PHANTOM_REPORT_ID (0x01)
    USHORT Buttons;       // 16 digital buttons (Xbox-compatible bitmask)
    UCHAR  HatSwitch;     // 0..7 directional, 8 = centered
    UCHAR  LeftTrigger;   // 0..255
    UCHAR  RightTrigger;  // 0..255
    SHORT  ThumbLX;       // -32768..32767
    SHORT  ThumbLY;       // -32768..32767
    SHORT  ThumbRX;       // -32768..32767
    SHORT  ThumbRY;       // -32768..32767
} PHANTOM_HID_INPUT_REPORT, *PPHANTOM_HID_INPUT_REPORT;
#pragma pack(pop)

C_ASSERT(sizeof(PHANTOM_HID_INPUT_REPORT) == PHANTOM_HID_REPORT_SIZE);

// Standard USB HID Gamepad Report Descriptor (Usage Page: Generic Desktop, Usage: Game Pad)
static const UCHAR G_PhantomHidReportDescriptor[] = {
    0x05, 0x01,        // Usage Page (Generic Desktop Ctrls)
    0x09, 0x05,        // Usage (Game Pad)
    0xA1, 0x01,        // Collection (Application)
    0x85, 0x01,        //   Report ID (1)

    // 16 Buttons
    0x05, 0x09,        //   Usage Page (Button)
    0x19, 0x01,        //   Usage Minimum (0x01)
    0x29, 0x10,        //   Usage Maximum (0x10)
    0x15, 0x00,        //   Logical Minimum (0)
    0x25, 0x01,        //   Logical Maximum (1)
    0x75, 0x01,        //   Report Size (1)
    0x95, 0x10,        //   Report Count (16)
    0x81, 0x02,        //   Input (Data,Var,Abs)

    // 4-bit Hat Switch + 4-bit padding
    0x05, 0x01,        //   Usage Page (Generic Desktop Ctrls)
    0x09, 0x39,        //   Usage (Hat switch)
    0x15, 0x00,        //   Logical Minimum (0)
    0x25, 0x07,        //   Logical Maximum (7)
    0x35, 0x00,        //   Physical Minimum (0)
    0x46, 0x3B, 0x01,  //   Physical Maximum (315)
    0x65, 0x14,        //   Unit (System: English Rotation, Length: Centimeter -> Degrees)
    0x75, 0x04,        //   Report Size (4)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x42,        //   Input (Data,Var,Abs,Null)
    0x75, 0x04,        //   Report Size (4)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x03,        //   Input (Const,Var,Abs)

    // Left & Right Triggers (0..255 via Accelerator / Brake usages)
    0x05, 0x02,        //   Usage Page (Sim Ctrls)
    0x09, 0xC5,        //   Usage (Brake -> L2)
    0x09, 0xC4,        //   Usage (Accelerator -> R2)
    0x15, 0x00,        //   Logical Minimum (0)
    0x26, 0xFF, 0x00,  //   Logical Maximum (255)
    0x75, 0x08,        //   Report Size (8)
    0x95, 0x02,        //   Report Count (2)
    0x81, 0x02,        //   Input (Data,Var,Abs)

    // 4 Signed 16-bit Thumbstick Axes (X, Y, Z, Rz)
    0x05, 0x01,        //   Usage Page (Generic Desktop Ctrls)
    0x09, 0x30,        //   Usage (X)
    0x09, 0x31,        //   Usage (Y)
    0x09, 0x32,        //   Usage (Z -> Right Stick X)
    0x09, 0x35,        //   Usage (Rz -> Right Stick Y)
    0x16, 0x00, 0x80,  //   Logical Minimum (-32768)
    0x26, 0xFF, 0x7F,  //   Logical Maximum (32767)
    0x75, 0x10,        //   Report Size (16)
    0x95, 0x04,        //   Report Count (4)
    0x81, 0x02,        //   Input (Data,Var,Abs)

    0xC0               // End Collection
};
