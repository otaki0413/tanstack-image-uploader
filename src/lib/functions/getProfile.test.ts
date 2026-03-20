import { describe, expect, it, vi } from "vitest";

import { getProfileHandler } from "./getProfile";

const mockUser = {
  id: "user1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  image: "https://example.com/avatar.png",
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-10T00:00:00Z"),
};

const recentRow = {
  id: "img1",
  filename: "photo.jpg",
  createdAt: new Date("2026-03-14T12:00:00Z"),
};

function createMockDbForProfile(options: {
  userRows: (typeof mockUser)[] | [];
  statsRows: { uploadCount: number; totalBytes: number | null }[];
  recentRows: (typeof recentRow)[];
}) {
  let selectCall = 0;
  return {
    select: vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(options.userRows),
          }),
        };
      }
      if (selectCall === 2) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(options.statsRows),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(options.recentRows),
            }),
          }),
        }),
      };
    }),
  };
}

describe("getProfileHandler", () => {
  it("returns null when user is not found", async () => {
    const mockDb = createMockDbForProfile({
      userRows: [],
      statsRows: [],
      recentRows: [],
    });
    const result = await getProfileHandler({ db: mockDb as any, userId: "missing" });
    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("returns user, aggregated stats, and recent images", async () => {
    const mockDb = createMockDbForProfile({
      userRows: [mockUser],
      statsRows: [{ uploadCount: 2, totalBytes: 3072 }],
      recentRows: [recentRow],
    });
    const result = await getProfileHandler({ db: mockDb as any, userId: "user1" });
    expect(result).toEqual({
      user: mockUser,
      stats: { uploadCount: 2, totalBytes: 3072 },
      recentImages: [recentRow],
    });
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it("treats missing aggregate row as zero stats", async () => {
    const mockDb = createMockDbForProfile({
      userRows: [mockUser],
      statsRows: [],
      recentRows: [],
    });
    const result = await getProfileHandler({ db: mockDb as any, userId: "user1" });
    expect(result?.stats).toEqual({ uploadCount: 0, totalBytes: 0 });
  });

  it("coerces null totalBytes from aggregate to 0", async () => {
    const mockDb = createMockDbForProfile({
      userRows: [mockUser],
      statsRows: [{ uploadCount: 0, totalBytes: null }],
      recentRows: [],
    });
    const result = await getProfileHandler({ db: mockDb as any, userId: "user1" });
    expect(result?.stats).toEqual({ uploadCount: 0, totalBytes: 0 });
  });
});
