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

basic.clearScreen()
bluetooth.startUartService()

basic.forever(function () {
    if (connected && streaming) {
        sendSample()
        basic.pause(1000)
    } else {
        basic.pause(50)
    }
})

function sendSample () {
    // The processor temperature is a board-based approximation, in degrees Celsius.
    bluetooth.uartWriteLine(convertToText(input.temperature()))
}
