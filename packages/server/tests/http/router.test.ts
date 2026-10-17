import express, { type Request, type Response } from "express";
import request from "supertest";
import { container } from "tsyringe";
import { describe, expect, it } from "vitest";
import { Controller } from "../../src/decorators/controller";
import { Delete, Get, Patch, Post, Put } from "../../src/decorators/routes";
import { createRouter } from "../../src/http/router";

// Exported so the class counts as used; the decorator is what registers it.
@Controller("/things")
export class ThingsController {
    private readonly prefix = "thing-";

    @Get("")
    list(_req: Request, res: Response): void {
        res.json([`${this.prefix}a`]);
    }

    @Post("/:id")
    create(req: Request<{ id: string }>, res: Response): void {
        res.status(201).json({ id: `${this.prefix}${req.params.id}` });
    }
}

// Exported so the class counts as used; the decorator is what registers it.
@Controller("/things")
export class ResourceController {
    @Put("/:id")
    replace(_req: Request, res: Response): void {
        res.json({ method: "put" });
    }

    @Patch("/:id")
    update(_req: Request, res: Response): void {
        res.json({ method: "patch" });
    }

    @Delete("/:id")
    remove(_req: Request, res: Response): void {
        res.json({ method: "delete" });
    }
}

describe("createRouter", () => {
    it("serves the routes declared on controllers, bound to their instance", async () => {
        const app = express().use(
            createRouter(container.createChildContainer()),
        );

        const list = await request(app).get("/things");
        const created = await request(app).post("/things/7");

        expect(list.status).toBe(200);
        expect(list.body).toEqual(["thing-a"]);
        expect(created.status).toBe(201);
        expect(created.body).toEqual({ id: "thing-7" });
    });

    it("registers PUT, PATCH, and DELETE handlers", async () => {
        const app = express().use(
            createRouter(container.createChildContainer()),
        );

        const put = await request(app).put("/things/1");
        const patch = await request(app).patch("/things/1");
        const del = await request(app).delete("/things/1");
        const get = await request(app).get("/things/1");

        expect(put.status).toBe(200);
        expect(put.body).toEqual({ method: "put" });
        expect(patch.status).toBe(200);
        expect(patch.body).toEqual({ method: "patch" });
        expect(del.status).toBe(200);
        expect(del.body).toEqual({ method: "delete" });
        expect(get.status).toBe(404);
    });

    it("rejects a controller without a base path", () => {
        class Undecorated {}

        Reflect.defineMetadata("controllers", [Undecorated], globalThis);

        try {
            expect(() =>
                createRouter(container.createChildContainer()),
            ).toThrow("Undecorated has no base path");
        } finally {
            Reflect.defineMetadata(
                "controllers",
                [ThingsController],
                globalThis,
            );
        }
    });
});
