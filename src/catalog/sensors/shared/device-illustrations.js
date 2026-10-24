// Static derivatives of the shared device models. Guides never load the 3D runtime.
const poster = (name, alt) => ({src:new URL(`../../../../public/assets/devices/posters/${name}.png`,import.meta.url).href,alt});
const board=poster('board','micro:bit V2 앞면의 버튼·LED와 뒷면의 회로·연결 단자');
const usb=poster('usb','micro:bit의 Micro-B 단자에 연결한 USB 데이터 케이블. 반대쪽은 컴퓨터에 연결해요.');
const battery=poster('battery','micro:bit 배터리 단자에 연결한 열린 케이스와 반대 방향으로 끼운 AAA 전지 두 개');
/** @type {import('../../../guide/types.js').DeviceIllustrations} */
export const deviceIllustrations={equipment:{microbit:board,usb,power:battery},usb,battery};
