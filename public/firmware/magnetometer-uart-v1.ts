let mode = "none"
let command = ""
let connected = 0
let calibrated = false

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()

    if (command == "start") {
        mode = "magnet"
        if (!(calibrated)) {
            if (input.buttonIsPressed(Button.A) || input.buttonIsPressed(Button.B)) {
                calibrated = true
            } else {
                input.calibrateCompass()
                calibrated = true
            }
        }
        basic.showString("M")
    } else {
        mode = "none"
        basic.clearScreen()
    }
})

bluetooth.onBluetoothConnected(function () {
    connected = 1
    basic.showIcon(IconNames.Yes)
})

bluetooth.onBluetoothDisconnected(function () {
    control.reset()
})

function showName () {
    basic.showString(control.deviceName().charAt(0))
    basic.showString(control.deviceName().charAt(1))
    basic.showString(control.deviceName().charAt(2))
    basic.showString(control.deviceName().charAt(3))
    basic.showString(control.deviceName().charAt(4))
    basic.showString(" mg ")
}

function setup () {
    input.setAccelerometerRange(AcceleratorRange.EightG)
    mode = "none"
    connected = 0
    calibrated = false
    bluetooth.startUartService()
    while (connected == 0) {
        showName()
    }
}

function sendSample () {
    bluetooth.uartWriteLine(
        convertToText(input.magneticForce(Dimension.X)) + "," +
        convertToText(input.magneticForce(Dimension.Y)) + "," +
        convertToText(input.magneticForce(Dimension.Z)) + "," +
        convertToText(input.magneticForce(Dimension.Strength))
    )
}

setup()

basic.forever(function () {
    if (mode == "magnet") {
        sendSample()
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})
