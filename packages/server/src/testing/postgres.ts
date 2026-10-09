import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { freePort } from "./ports";

/**
 * An in-memory Postgres server for an end-to-end test: database `postgres`, user `postgres`, no password, on
 * 127.0.0.1. Disposing stops it.
 */
export interface TestPostgres extends AsyncDisposable {
    readonly port: number;
}

/**
 * Starts an in-memory Postgres (PGlite) server that real processes can connect to.
 */
export async function startTestPostgres(): Promise<TestPostgres> {
    const port = await freePort();
    const resources = new AsyncDisposableStack();
    const database = resources.use(new PGlite());
    const server = new PGLiteSocketServer({
        db: database,
        host: "127.0.0.1",
        port,
        maxConnections: 10,
    });

    await server.start();
    // PGLiteSocketServer is not disposable; stop it before the database closes.
    resources.defer(() => server.stop());

    return { port, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
