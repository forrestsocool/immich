import {
  HONOR_MOTION_PHOTO_TRAILER_SIZE,
  getHonorMotionPhotoRange,
  isValidMotionPhotoVideo,
} from 'src/utils/motion-photo.js';

const makeTrailer = (length: string, version = 'v2_f17', timestamp = '24:1000') =>
  Buffer.from(version.padEnd(20) + timestamp.padEnd(20) + `LIVE_${length}`.padEnd(20));

const makeBox = (type: string, payload = Buffer.alloc(0)) => {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length);
  box.write(type, 4, 4, 'latin1');
  payload.copy(box, 8);
  return box;
};

const ftyp = makeBox('ftyp', Buffer.from('mp42\0\0\0\0isommp42', 'latin1'));

describe('getHonorMotionPhotoRange', () => {
  it('should locate the MP4 without including the Honor trailer', () => {
    const trailer = makeTrailer('2774810');
    expect(trailer.length).toBe(HONOR_MOTION_PHOTO_TRAILER_SIZE);
    expect(getHonorMotionPhotoRange(trailer, 6_247_866)).toEqual({ position: 3_473_016, length: 2_774_790 });
  });

  it.each([
    ['a truncated trailer', makeTrailer('2774810').subarray(1), 6_247_866],
    ['an invalid version', makeTrailer('2774810', 'not-a-motion-photo'), 6_247_866],
    ['an invalid timestamp', makeTrailer('2774810', 'v2_f17', 'invalid'), 6_247_866],
    ['a nonnumeric length', makeTrailer('2774810x'), 6_247_866],
    ['a negative length', makeTrailer('-1'), 6_247_866],
    ['a length containing only the trailer field', makeTrailer('20'), 6_247_866],
    ['a range outside the file', makeTrailer('99999999'), 6_247_866],
    ['a range overlapping the JPEG header', makeTrailer('6247825'), 6_247_866],
    ['an unsafe file size', makeTrailer('2774810'), Number.MAX_SAFE_INTEGER + 1],
  ])('should reject %s', (_name, trailer, fileSize) => {
    expect(getHonorMotionPhotoRange(trailer as Buffer, fileSize as number)).toBeUndefined();
  });
});

describe('isValidMotionPhotoVideo', () => {
  it('should accept a complete MP4 including its vendor extension boxes', () => {
    const video = Buffer.concat([ftyp, makeBox('moov'), makeBox('free'), makeBox('mdat'), makeBox('uuid')]);
    expect(isValidMotionPhotoVideo(video)).toBe(true);
  });

  it('should accept a movie box after the media data', () => {
    expect(isValidMotionPhotoVideo(Buffer.concat([ftyp, makeBox('mdat'), makeBox('moov')]))).toBe(true);
  });

  it('should accept an extended box size', () => {
    const moov = Buffer.alloc(16);
    moov.writeUInt32BE(1);
    moov.write('moov', 4);
    moov.writeBigUInt64BE(16n, 8);
    expect(isValidMotionPhotoVideo(Buffer.concat([ftyp, moov, makeBox('mdat')]))).toBe(true);
  });

  it('should accept media data extending to the end of the MP4', () => {
    const mdat = makeBox('mdat');
    mdat.writeUInt32BE(0);
    expect(isValidMotionPhotoVideo(Buffer.concat([ftyp, makeBox('moov'), mdat]))).toBe(true);
  });

  it.each([
    ['an empty payload', Buffer.alloc(0)],
    ['a truncated box header', Buffer.from('ftyp')],
    ['a missing movie box', Buffer.concat([ftyp, makeBox('mdat')])],
    ['a missing media data box', Buffer.concat([ftyp, makeBox('moov')])],
    ['a misplaced file type box', Buffer.concat([makeBox('moov'), ftyp, makeBox('mdat')])],
    [
      'a truncated media data box',
      Buffer.concat([ftyp, makeBox('moov'), makeBox('mdat', Buffer.alloc(8))]).subarray(0, -1),
    ],
    [
      'bytes after the last complete box',
      Buffer.concat([ftyp, makeBox('moov'), makeBox('mdat'), Buffer.from('LIVE_')]),
    ],
    ['an undersized box', Buffer.from('0000000466747970', 'hex')],
    ['a truncated extended size', Buffer.from('0000000166747970', 'hex')],
    ['an unsafe extended size', Buffer.from('0000000166747970ffffffffffffffff', 'hex')],
  ])('should reject %s', (_name, video) => {
    expect(isValidMotionPhotoVideo(video)).toBe(false);
  });
});
