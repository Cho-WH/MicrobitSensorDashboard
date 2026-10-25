// Standard gravity defines the unit g; it is not a local gravity calibration.
export const STANDARD_GRAVITY = 9.80665;
export const MILLI_G_TO_SI = STANDARD_GRAVITY / 1000;
export const isSIAcceleration = channel => channel.quantity === 'acceleration' && channel.unit === 'm/s²';
