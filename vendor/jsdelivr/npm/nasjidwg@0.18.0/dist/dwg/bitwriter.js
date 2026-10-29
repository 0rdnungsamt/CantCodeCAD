/* nasjidwg — DWG bit-level stream writer: the exact mirror of BitReader.
 * Writes the bitcode primitives (B, BS, BD, H, MC, ...) MSB-first into a
 * growable buffer. */
export class BitWriter {
    buf = new Uint8Array(1024);
    /** Position in BITS. */
    pos = 0;
    scratch = new DataView(new ArrayBuffer(8));
    ensure(bits) {
        const need = (this.pos + bits + 7) >> 3;
        if (need <= this.buf.length)
            return;
        let cap = this.buf.length * 2;
        while (cap < need)
            cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this.buf);
        this.buf = next;
    }
    /** Finished bytes (padded with zero bits to the last byte). */
    bytes() {
        return this.buf.slice(0, (this.pos + 7) >> 3);
    }
    get byteLength() { return (this.pos + 7) >> 3; }
    b(v) {
        this.ensure(1);
        if (v & 1)
            this.buf[this.pos >> 3] |= 0x80 >> (this.pos & 7);
        this.pos++;
    }
    bb(v) { this.b(v >> 1); this.b(v); }
    bbb(v) { this.b(v >> 2); this.b(v >> 1); this.b(v); }
    rc(v) {
        this.ensure(8);
        const off = this.pos & 7;
        const i = this.pos >> 3;
        const byte = v & 0xff;
        if (off === 0)
            this.buf[i] = byte;
        else {
            this.buf[i] |= byte >> off;
            this.buf[i + 1] = (byte << (8 - off)) & 0xff;
        }
        this.pos += 8;
    }
    raw(bytes) {
        for (let i = 0; i < bytes.length; i++)
            this.rc(bytes[i]);
    }
    rs(v) { this.rc(v); this.rc(v >> 8); }
    rl(v) { this.rs(v); this.rs(Math.floor(v / 0x10000)); }
    rll(v) { this.rl(v >>> 0); this.rl(Math.floor(v / 0x100000000)); }
    /** BLL — 3-bit byte count, then that many little-endian bytes. */
    bll(v) {
        let n = 0, x = v;
        while (x > 0 && n < 7) {
            n++;
            x = Math.floor(x / 256);
        }
        this.bbb(n);
        let rest = v;
        for (let i = 0; i < n; i++) {
            this.rc(rest % 256);
            rest = Math.floor(rest / 256);
        }
    }
    rd(v) {
        this.scratch.setFloat64(0, v, true);
        for (let i = 0; i < 8; i++)
            this.rc(this.scratch.getUint8(i));
    }
    /** BS — bitshort with compact encodings. */
    bs(v) {
        if (v === 0)
            this.bb(2);
        else if (v === 256)
            this.bb(3);
        else if (v >= 0 && v <= 255) {
            this.bb(1);
            this.rc(v);
        }
        else {
            this.bb(0);
            this.rs(v < 0 ? v + 0x10000 : v);
        }
    }
    /** BL — bitlong. */
    bl(v) {
        if (v === 0)
            this.bb(2);
        else if (v >= 0 && v <= 255) {
            this.bb(1);
            this.rc(v);
        }
        else {
            this.bb(0);
            this.rl(v < 0 ? v + 0x100000000 : v);
        }
    }
    /** BD — bitdouble. */
    bd(v) {
        if (v === 0)
            this.bb(2);
        else if (v === 1)
            this.bb(1);
        else {
            this.bb(0);
            this.rd(v);
        }
    }
    bd2(x, y) { this.bd(x); this.bd(y); }
    bd3(x, y, z) { this.bd(x); this.bd(y); this.bd(z); }
    /** DD — double with default (writes compact 00 when equal). */
    dd(v, dflt) {
        if (v === dflt || (Number.isNaN(v) && Number.isNaN(dflt)))
            this.bb(0);
        else {
            this.bb(3);
            this.rd(v);
        }
    }
    /** BT — bit thickness (R2000+). */
    bt(v) {
        if (v === 0)
            this.b(1);
        else {
            this.b(0);
            this.bd(v);
        }
    }
    /** BE — bit extrusion (R2000+). */
    be(x, y, z) {
        if (x === 0 && y === 0 && z === 1)
            this.b(1);
        else {
            this.b(0);
            this.bd3(x, y, z);
        }
    }
    /** MC — signed modular char. */
    mc(v) {
        let value = Math.abs(Math.round(v));
        const negative = v < 0;
        const parts = [];
        for (;;) {
            const lo = value & 0x7f;
            value = Math.floor(value / 128);
            parts.push(lo);
            if (value === 0)
                break;
        }
        /* sign lives in the 0x40 bit of the final byte */
        if (parts[parts.length - 1] & 0x40)
            parts.push(0);
        if (negative)
            parts[parts.length - 1] |= 0x40;
        for (let i = 0; i < parts.length; i++) {
            this.rc(parts[i] | (i < parts.length - 1 ? 0x80 : 0));
        }
    }
    /** UMC — unsigned modular char. */
    umc(v) {
        let value = Math.round(v);
        for (;;) {
            const lo = value % 128;
            value = Math.floor(value / 128);
            if (value === 0) {
                this.rc(lo);
                return;
            }
            this.rc(lo | 0x80);
        }
    }
    /** MS — modular short. */
    ms(v) {
        let value = Math.round(v);
        for (;;) {
            const lo = value % 0x8000;
            value = Math.floor(value / 0x8000);
            if (value === 0) {
                this.rs(lo);
                return;
            }
            this.rs(lo | 0x8000);
        }
    }
    /** H — handle reference (code nibble + counter + big-endian bytes). */
    h(code, value) {
        const bytesOut = [];
        let v = value;
        while (v > 0) {
            bytesOut.unshift(v % 256);
            v = Math.floor(v / 256);
        }
        this.rc(((code & 0x0f) << 4) | bytesOut.length);
        for (const byteV of bytesOut)
            this.rc(byteV);
    }
    /** When set, t() writes into this stream instead (R2007+ string stream). */
    strTarget;
    /** True when strings are UTF-16 (R2007+). */
    utf16 = false;
    /** T — length-prefixed (BS) codepage text; ASCII-safe or pre-encoded. */
    t(s) {
        const w = this.strTarget ?? this;
        if (this.utf16) {
            w.tu(s);
            return;
        }
        w.bs(s.length);
        for (let i = 0; i < s.length; i++)
            w.rc(s.charCodeAt(i) & 0xff);
    }
    /** TU — length-prefixed (BS) UTF-16LE text (R2007+). */
    tu(s) {
        this.bs(s.length);
        for (let i = 0; i < s.length; i++)
            this.rs(s.charCodeAt(i));
    }
    /** Append `nbits` bits from `bytes`, MSB-first — the exact mirror of a
     *  bit-by-bit capture. Used for opaque payload passthrough (proxies),
     *  where the stream is not byte-aligned and every bit must survive. */
    putBits(bytes, nbits) {
        for (let i = 0; i < nbits; i++) {
            this.b((bytes[i >> 3] >> (7 - (i & 7))) & 1);
        }
    }
    /** Append another writer's bits (bit-exact, not byte-aligned). */
    appendBits(other) {
        const bytes = other.bytes();
        const n = other.pos;
        for (let i = 0; i < n; i++) {
            this.b((bytes[i >> 3] >> (7 - (i & 7))) & 1);
        }
    }
    /** Advance to the next byte boundary (zero-filled). */
    align() { this.pos = (this.pos + 7) & ~7; }
    /** Fill in an RL placeholder written earlier.
     *
     *  This cannot go through rl(): the byte writers assume they are running
     *  off the end of the buffer and clear the byte ahead of themselves, so
     *  rewinding into the middle of a finished record would wipe the four
     *  bits that follow the field. Thirty-two OR'd bits leave everything
     *  around them exactly as it was. The placeholder must have been zero. */
    patchRl(bitPos, v) {
        const value = (v < 0 ? v + 0x100000000 : v) >>> 0;
        for (let i = 0; i < 32; i++) {
            /* little-endian bytes, most significant bit of each byte first */
            const bit = (value >>> ((i & ~7) + (7 - (i & 7)))) & 1;
            if (!bit)
                continue;
            const at = bitPos + i;
            this.buf[at >> 3] |= 0x80 >> (at & 7);
        }
    }
}
/* nasjidwg — byte-level growable sink for section and file assembly.
 * The assemblers used to accumulate whole section images in a plain
 * number[]; V8 refuses to grow an Array past ~112.8M elements (push
 * throws RangeError "Invalid array length"), so a large drawing whose
 * objects section crossed that many bytes could not be written at all.
 * A Uint8Array has no such cap — and holds one byte per byte, not one
 * tagged slot. */
export class ByteSink {
    buf = new Uint8Array(1024);
    length = 0;
    ensure(n) {
        const need = this.length + n;
        if (need <= this.buf.length)
            return;
        let cap = this.buf.length * 2;
        while (cap < need)
            cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this.buf.subarray(0, this.length));
        this.buf = next;
    }
    push(...values) {
        this.ensure(values.length);
        for (let i = 0; i < values.length; i++) {
            this.buf[this.length++] = values[i];
        }
    }
    append(bytes) {
        this.ensure(bytes.length);
        if (bytes instanceof Uint8Array) {
            this.buf.set(bytes, this.length);
            this.length += bytes.length;
        }
        else {
            for (let i = 0; i < bytes.length; i++)
                this.buf[this.length++] = bytes[i];
        }
    }
    at(i) { return this.buf[i]; }
    set(i, v) { this.buf[i] = v; }
    /** Live window into the accumulated bytes (no copy) — consume it
     *  before the next push, which may reallocate the buffer under it. */
    view(start = 0, end = this.length) {
        return this.buf.subarray(start, end);
    }
    /** The finished image (an owned copy, trimmed to length). */
    bytes() { return this.buf.slice(0, this.length); }
}
/** The DWG CRC-16 (reflected poly 0xA001, i.e. CRC-16/ARC with a seed). */
export const crc16 = (seed, data, start = 0, end = data.length) => {
    let crc = seed & 0xffff;
    for (let i = start; i < end; i++) {
        crc ^= data[i];
        for (let k = 0; k < 8; k++) {
            crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
        }
    }
    return crc & 0xffff;
};
