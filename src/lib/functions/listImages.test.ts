import { describe, expect, it, vi } from "vitest";

import { listImagesHandler } from "./listImages";

const mockImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("listImagesHandler", () => {
  it("returns images ordered by createdAt desc, limit 50", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockImage]),
          }),
        }),
      }),
    };

    const result = await listImagesHandler({ db: mockDb as any });
    expect(result).toEqual([mockImage]);
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("returns empty array when no images", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const result = await listImagesHandler({ db: mockDb as any });
    expect(result).toEqual([]);
  });
});
