let streaming = false
let command = ""

bluetooth.startUartService()

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()

    if (command == "start") {
        streaming = true
        basic.showIcon(IconNames.Yes)
    } else {
        streaming = false
        basic.clearScreen()
    }
})

basic.forever(function () {
    if (streaming) {
        sendSample()
        basic.pause(1000)
    } else {
        basic.pause(50)
    }
})

function sendSample () {
    bluetooth.uartWriteLine(convertToText(input.temperature()))
}
