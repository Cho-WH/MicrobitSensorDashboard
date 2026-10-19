let streaming = false
let connected = false
let command = ""

bluetooth.onBluetoothConnected(function () {
    connected = true
    streaming = false
    basic.clearScreen()
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    basic.clearScreen()
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()
    streaming = connected && command == "start"
    basic.clearScreen()
})

input.setAccelerometerRange(AcceleratorRange.EightG)
basic.clearScreen()
bluetooth.startUartService()

basic.forever(function () {
    if (connected && streaming) {
        sendSample()
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})

function sendSample () {
    // Preserve MakeCode's raw milli-g values, including gravity, in X/Y/Z/Strength order.
    bluetooth.uartWriteLine(
        convertToText(input.acceleration(Dimension.X)) + "," +
        convertToText(input.acceleration(Dimension.Y)) + "," +
        convertToText(input.acceleration(Dimension.Z)) + "," +
        convertToText(input.acceleration(Dimension.Strength))
    )
}
