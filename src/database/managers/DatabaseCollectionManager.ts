import {
    Collection,
    Document,
    Filter,
    FindOptions,
    InsertManyResult,
    OptionalUnlessRequiredId,
    UpdateFilter,
    UpdateOptions,
    UpdateResult,
} from "mongodb";

/**
 * A MongoDB collection manager.
 */
export abstract class DatabaseCollectionManager<T extends Document> {
    /**
     * The collection that this manager is responsible for.
     */
    protected readonly collection: Collection<T>;

    /**
     * The default document of this collection.
     */
    abstract get defaultDocument(): T;

    /**
     * @param collection The MongoDB collection.
     */
    constructor(collection: Collection<T>) {
        this.collection = collection;
    }

    /**
     * Gets multiple documents from the collection.
     * @param filter The document filter.
     * @param options The options for retrieving the documents.
     * @returns The documents.
     */
    get(filter: Filter<T> = {}, options?: FindOptions<T>): Promise<T[]> {
        return <Promise<T[]>>this.collection.find(filter, options).toArray();
    }

    /**
     * Gets a document from the collection and convert it
     * to its utility.
     *
     * @param filter The document filter.
     * @param options The options for retrieving the documents.
     * @returns The converted document.
     */
    getOne(
        filter: Filter<T> = {},
        options?: FindOptions<T>
    ): Promise<T | null> {
        return this.collection.findOne(filter, options);
    }

    /**
     * Updates multiple documents in the collection.
     *
     * @param filter The filter used to select the documents to update.
     * @param query The update operations to be applied to the documents.
     * @param options Options for the update operation.
     * @returns Whether the operation succeeded.
     */
    updateMany(
        filter: Filter<T>,
        query: UpdateFilter<T> | Partial<T>,
        options: UpdateOptions = {}
    ): Promise<UpdateResult> {
        return this.collection.updateMany(filter, query, options);
    }

    /**
     * Updates a document in the collection.
     *
     * @param filter The filter used to select the document to update.
     * @param query The update operations to be applied to the document.
     * @param options Options for the update operation.
     * @returns An object containing information about the operation.
     */
    updateOne(
        filter: Filter<T>,
        query: UpdateFilter<T> | Partial<T>,
        options: UpdateOptions = {}
    ): Promise<UpdateResult> {
        return this.collection.updateOne(filter, query, options);
    }

    /**
     * Inserts multiple documents into the collection.
     *
     * @param docs The part of documents to insert. Each document will be assigned to the default document with `Object.assign()`.
     */
    insert(...docs: Partial<T>[]): Promise<InsertManyResult<T>> {
        return this.collection.insertMany(
            docs.map(
                (v) =>
                    <OptionalUnlessRequiredId<T>>(
                        Object.assign(this.defaultDocument, v)
                    )
            )
        );
    }
}
