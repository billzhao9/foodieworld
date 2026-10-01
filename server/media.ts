export function mediaResponse(data: Buffer, type: string, range?: string, download = false) {
  const headers = {
    // MediaRecorder may report codec hints that do not match the final stream
    // (e.g. AVC level 1 for a level 5 recording). Let the container identify it.
    "Content-Type": type.split(";")[0]!.trim().toLowerCase(),
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    ...(download ? { "Content-Disposition": `attachment; filename="foodieworld.${type.split(';')[0] === 'video/mp4' ? 'mp4' : type.split(';')[0] === 'video/webm' ? 'webm' : 'mkv'}"` } : {}),
  };
  const invalid = () =>
    new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${data.length}` },
    });
  if (!range)
    return new Response(new Uint8Array(data), {
      headers: { ...headers, "Content-Length": String(data.length) },
    });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, data.length - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), data.length - 1)
      : data.length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= data.length
  )
    return invalid();
  return new Response(new Uint8Array(data.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${data.length}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
