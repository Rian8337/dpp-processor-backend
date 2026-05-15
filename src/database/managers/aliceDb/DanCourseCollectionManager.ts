import { IDanCourse } from "../../structures/aliceDb/IDanCourse";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

/**
 * A manager for the `dancoursemaps` collection.
 */
export class DanCourseCollectionManager extends DatabaseCollectionManager<IDanCourse> {
    get defaultDocument(): IDanCourse {
        return {
            courseName: "",
            fileName: "",
            hash: "",
            roleId: "",
            requirement: {
                id: "score",
                value: 0,
            },
        };
    }

    /**
     * Gets a course from its beatmap MD5 hash.
     *
     * @param hash The beatmap MD5 hash of the course.
     * @returns The course, `null` if not found.
     */
    getCourse(hash: string): Promise<IDanCourse | null> {
        return this.getOne({ hash: hash });
    }
}
