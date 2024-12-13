import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3ClientConfig,
  PutObjectCommandInput,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListObjectsV2CommandOutput,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { NodeJsRuntimeStreamingBlobPayloadOutputTypes } from "@smithy/types";

// Array.fromAsync polyfill https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/fromAsync
const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

const isNoSuchKeyError = (error: unknown): error is NoSuchKey =>
  typeof error === "object" &&
  error !== null &&
  "Code" in error &&
  error.Code === "NoSuchKey";

export default class S3LocalStorage {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, clientOpts?: S3ClientConfig) {
    // Creating a client for Object Storage (explicit configuration from env)
    this.s3Client = new S3Client({
      ...clientOpts,
    });

    this.bucketName = bucketName;
  }

  async setItem(key: string, value: string, opts?: PutObjectCommandInput) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: value,
      ContentType: "text/plain",
      ...opts,
    });
    await this.s3Client.send(command);
  }

  async getItem(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const valueData = await this.s3Client.send(command);
      const valueBody =
        valueData.Body as NodeJsRuntimeStreamingBlobPayloadOutputTypes;
      const valueBuffer = await streamToBuffer(valueBody);
      const value = valueBuffer.toString("utf-8");
      return value;
    } catch (error: unknown) {
      if (isNoSuchKeyError(error)) {
        return;
      }
      throw error;
    }
  }

  async removeItem(key: string) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error: unknown) {
      if (isNoSuchKeyError(error)) {
        return;
      }
      throw error;
    }
  }

  async clear() {
    let isTruncated: boolean = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        ContinuationToken: continuationToken,
      });
      const listResult: ListObjectsV2CommandOutput =
        await this.s3Client.send(listCommand);

      // Step 2: Delete objects in batches
      if (listResult.Contents && listResult.Contents.length > 0) {
        const listResultObjects = listResult.Contents.map((object) => ({
          Key: object.Key,
        }));
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: listResultObjects,
          },
        });
        await this.s3Client.send(deleteCommand);
      }

      // Check if there are more objects to list
      isTruncated = listResult.IsTruncated ?? false;
      continuationToken = listResult.NextContinuationToken;
    }
  }
}
