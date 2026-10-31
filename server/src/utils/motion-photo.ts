export const HONOR_MOTION_PHOTO_TRAILER_SIZE = 60;

export const getHonorMotionPhotoRange = (trailer: Buffer, fileSize: number) => {
  if (trailer.length !== HONOR_MOTION_PHOTO_TRAILER_SIZE || !Number.isSafeInteger(fileSize)) {
    return;
  }

  const version = trailer.subarray(0, 20).toString().trimEnd();
  const timestamp = trailer.subarray(20, 40).toString().trimEnd();
  const lengthMatch = /^LIVE_(\d+) *$/.exec(trailer.subarray(40).toString());
  if (!/^v\d+_f\d+(?:_[cn])?$/.test(version) || !/^\d+:\d+$/.test(timestamp) || !lengthMatch) {
    return;
  }

  const length = Number(lengthMatch[1]) - 20;
  const position = fileSize - HONOR_MOTION_PHOTO_TRAILER_SIZE - length;
  if (!Number.isSafeInteger(length) || length < 16 || position < 2) {
    return;
  }

  return { position, length };
};

export const isValidMotionPhotoVideo = (video: Buffer): boolean => {
  const types = new Set<string>();
  let position = 0;
  while (position < video.length) {
    const remaining = video.length - position;
    if (remaining < 8) {
      return false;
    }

    let length = video.readUInt32BE(position);
    const type = video.toString('latin1', position + 4, position + 8);
    let headerLength = 8;
    if (length === 1) {
      if (remaining < 16) {
        return false;
      }
      length = Number(video.readBigUInt64BE(position + 8));
      headerLength = 16;
    } else if (length === 0) {
      length = remaining;
    }

    if (!Number.isSafeInteger(length) || length < headerLength || length > remaining) {
      return false;
    }
    if (position === 0 && (type !== 'ftyp' || length < headerLength + 8)) {
      return false;
    }

    types.add(type);
    position += length;
  }

  return types.has('ftyp') && types.has('moov') && types.has('mdat');
};
