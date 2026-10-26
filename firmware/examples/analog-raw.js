// Common-runtime foundation: raw 0..1023 ADC counts, P0/P1/P2 order, nominal 100 ms.
// Pins are sampled sequentially, not simultaneously. No sensor-specific conversion.
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
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    streaming = connected && command == "start"
})

basic.clearScreen()
bluetooth.startUartService()
basic.forever(function () {
    if (connected && streaming) {
        let p0 = pins.analogReadPin(AnalogPin.P0)
        let p1 = pins.analogReadPin(AnalogPin.P1)
        let p2 = pins.analogReadPin(AnalogPin.P2)
        bluetooth.uartWriteLine(convertToText(p0) + "," + convertToText(p1) + "," + convertToText(p2))
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})
