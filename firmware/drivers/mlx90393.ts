// MLX90393 rev012 (Melexis), tables 12, 17, 19, 21. See MLX90393-NOTICES.md.
// Restricted to two verified register recipes, no EEPROM writes or compass calibration.
let mlxAddress = 0
let mlxWide = false

function mlxExchange(bytes: number[], length: number) {
    if (pins.i2cWriteBuffer(mlxAddress, pins.createBufferFromArray(bytes)) != 0) return pins.createBuffer(0)
    return pins.i2cReadBuffer(mlxAddress, length)
}
function mlxStatus(bytes: Buffer, length: number) {
    return bytes.length == length && (bytes[0] & 0x14) == 0 && (length == 1 || (bytes[0] & 3) == (length - 3) / 2)
}
function mlxReadRegister(reg: number) {
    let b = mlxExchange([0x50, reg << 2], 3)
    return mlxStatus(b, 3) ? b[1] * 256 + b[2] : -1
}
function mlxUpdateRegister(reg: number, mask: number, value: number) {
    let old = mlxReadRegister(reg)
    if (old < 0) return false
    let next = (old & ~mask) | (value & mask)
    if (!mlxStatus(mlxExchange([0x60, next >> 8, next & 255, reg << 2], 1), 1)) return false
    return mlxReadRegister(reg) == next
}
function mlxInitialize(wide: boolean) {
    mlxAddress = 0
    // Current and original Adafruit QT addresses, including hardware address straps.
    let addresses = [0x18, 0x19, 0x1A, 0x1B, 0x0C, 0x0D, 0x0E, 0x0F]
    for (let i = 0; i < addresses.length; i++) {
        mlxAddress = addresses[i]
        if (!mlxStatus(mlxExchange([0x80], 1), 1)) continue
        basic.pause(5)
        // A write/readback challenge rejects absent buses returning all zeroes.
        if (!mlxUpdateRegister(0, 0x007F, wide ? 0x000C : 0x007C)) continue
        // Disable temperature compensation and external trigger; preserve other trim bits.
        if (!mlxUpdateRegister(1, 0x0600, 0)) continue
        if (!mlxUpdateRegister(2, 0x1FFF, (wide ? 0x02A0 : 0) | 0x001A)) continue
        mlxWide = wide
        return true
    }
    mlxAddress = 0
    return false
}
function mlxMeasure() {
    let empty: number[] = []
    // Recheck volatile settings: a sensor reset must not silently change scaling.
    if (mlxAddress == 0 || (mlxReadRegister(0) & 0x7F) != (mlxWide ? 0x0C : 0x7C)
        || (mlxReadRegister(1) & 0x0600) != 0
        || (mlxReadRegister(2) & 0x1FFF) != ((mlxWide ? 0x02A0 : 0) | 0x001A)) return empty
    let started = mlxExchange([0x3F], 1)
    if (!mlxStatus(started, 1) || (started[0] & 0x20) == 0) return empty
    basic.pause(62)
    let b = mlxExchange([0x4F], 9)
    if (!mlxStatus(b, 9)) return empty
    let result: number[] = []
    for (let axis = 0; axis < 3; axis++) {
        let raw = b.getNumber(NumberFormat.Int16BE, 3 + axis * 2)
        // Return raw ADC counts; app marks endpoint/saturation values invalid, preserving evidence.
        result.push(raw)
    }
    return result
}
