import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient();

export type Session = typeof authClient.$Infer.Session;
