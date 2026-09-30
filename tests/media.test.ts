import { expect, it } from "vitest";
import { mediaResponse } from "../server/media";
it("serves recorder MP4 with the container MIME type rather than inaccurate codec hints", () => {
  const response = mediaResponse(
    Buffer.from("0123456789"),
    "video/mp4; codecs=avc1.42000a,mp4a.40.2",
    "bytes=0-1",
  );
  expect(response.status).toBe(206);
  expect(response.headers.get("content-type")).toBe("video/mp4");
  expect(response.headers.get("content-range")).toBe("bytes 0-1/10");
});
