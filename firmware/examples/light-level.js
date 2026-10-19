let streaming = false
let connected = false
let command = ""
let commandVersion = 0

bluetooth.onBluetoothConnected(function () {
    connected = true
    streaming = false
    commandVersion += 1
    basic.clearScreen()
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    commandVersion += 1
    basic.clearScreen()
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()
    commandVersion += 1
    let startRequest = commandVersion
    streaming = false
    basic.clearScreen()

    if (connected && command == "start") {
        // The first call enables LED light sensing and returns a placeholder zero.
        // Keep the display enabled and blank; later zero readings are valid darkness.
        input.lightLevel()
        basic.pause(100)
        if (connected && commandVersion == startRequest) {
            streaming = true
        }
    }
})

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
    // Relative brightness from 0 to 255; this value is not illuminance in lux.
    bluetooth.uartWriteLine(convertToText(input.lightLevel()))
}
