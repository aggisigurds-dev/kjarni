/** Sér eining svo aðeins MP3-kóðarinn (LAME í WebAssembly) fylgi með í
 *  niðurhalinu — ekki Ogg-kóðarinn úr sama pakka. */
export { createMp3Encoder } from "wasm-media-encoders";
