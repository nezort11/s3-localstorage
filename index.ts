import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  S3ClientConfig,
  PutObjectCommandInput,
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
      if (
        typeof error === "object" &&
        error !== null &&
        "Code" in error &&
        error?.Code === "NoSuchKey"
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
