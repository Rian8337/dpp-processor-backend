import {
    Abortable,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Collection,
    Document,
    FindOptions,
} from "mongodb";

/**
 * Generic type for {@link Collection.findMany} options.
 *
 * @template TSchema The type of the documents in the collection.
 */
export type FindManyOptions<TSchema extends Document> = FindOptions<TSchema> &
    Abortable;

/**
 * Generic type for {@link Collection.findOne} options.
 *
 * @template TSchema The type of the documents in the collection.
 */
export type FindOneOptions<TSchema extends Document> = Omit<
    FindManyOptions<TSchema>,
    "timeoutMode"
>;
