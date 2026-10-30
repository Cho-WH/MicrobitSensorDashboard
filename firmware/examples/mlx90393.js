let connected = false
let streaming = false
let request = 0
let configured = -1
let preset = "normal"
let token = "0"
bluetooth.onBluetoothConnected(function () {
    connected = true; streaming = false; request += 1
    SensorDisplay.setMode("connected")
})
bluetooth.onBluetoothDisconnected(function () {
    connected = false; streaming = false; request += 1
    SensorDisplay.setMode("waiting")
})
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    if (!connected) return
    if (command == "prepare") {
        streaming = false; request += 1
        bluetooth.uartWriteLine("@mlx,1,ready")
    } else if (command == "stop") {
        streaming = false; request += 1
    } else {
        let parts = command.split(",")
        if (parts.length != 3 || parts[0] != "configure" || (parts[1] != "normal" && parts[1] != "wide")) return
        let id = parseInt(parts[2])
        if (id < 1 || id > 1000000 || convertToText(id) != parts[2]) return
        preset = parts[1]; token = parts[2]; request += 1; streaming = true
    }
    SensorDisplay.setMode("connected")
})
basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(true)
basic.forever(function () {
    if (!connected || !streaming) { basic.pause(50); return }
    let current = request
    let currentPreset = preset
    let currentToken = token
    let startedAt = input.runningTime()
    if (configured != current) {
        let ok = mlxInitialize(currentPreset == "wide")
        if (!connected || !streaming || current != request) return
        if (!ok) {
            streaming = false
            bluetooth.uartWriteLine("@mlx,1,error," + currentToken)
            return
        }
        configured = current
        bluetooth.uartWriteLine("@mlx,1,applied," + currentPreset + "," + currentToken)
        SensorDisplay.setMode("streaming")
    }
    let values = mlxMeasure()
    if (!connected || !streaming || current != request) return
    if (values.length == 3) bluetooth.uartWriteLine("mlx,1," + currentPreset + "," + currentToken + "," + values.join(","))
    let remaining = 100 - (input.runningTime() - startedAt)
    if (remaining > 0) basic.pause(remaining)
})
