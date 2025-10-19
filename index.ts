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
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { RequestPresigningArguments } from "@smithy/types";
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

type CommandType = "GET" | "PUT" | "DELETE";

export default class S3LocalStorage {
  public s3Client: S3Client;
  public bucketName: string;

  constructor(bucketName: string, clientOpts?: S3ClientConfig) {
    const region = process.env.AWS_REGION;
    const endpoint = process.env.AWS_S3_ENDPOINT;
    // Creating a client for Object Storage (explicit configuration from env)
    this.s3Client = new S3Client({
      ...(region && { region: region }),
      ...(endpoint && { endpoint: endpoint }),
      ...clientOpts,
    });

    this.bucketName = bucketName;
  }

  async setItem(
    key: string,
    value: PutObjectCommandInput["Body"],
    opts?: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body">
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: value,
      ...(typeof value === "string" && { ContentType: "text/plain" }),
      ...opts,
    });
    await this.s3Client.send(command);
  }

  async getItem(key: string, encoding: BufferEncoding | null = "utf8") {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const valueData = await this.s3Client.send(command);
      const valueBody =
        valueData.Body as NodeJsRuntimeStreamingBlobPayloadOutputTypes;
      const valueBuffer = await streamToBuffer(valueBody);

      if (encoding === null) {
        return valueBuffer;
      } else {
        const value = valueBuffer.toString(encoding);
        return value;
      }
    } catch (error: unknown) {
      if (isNoSuchKeyError(error)) {
        return;
      }
      throw error;
    }
  }

  // Generate presigned url for S3 object
  // https://docs.aws.amazon.com/code-library/latest/ug/s3_example_s3_Scenario_PresignedUrl_section.html
  // NOTE: works well only for AWS S3
  async getItemLink(
    key: string,
    commandType: CommandType = "GET",
    opts?: RequestPresigningArguments
  ) {
    const commandInput = {
      Bucket: this.bucketName,
      Key: key,
    };
    const command = {
      GET: new GetObjectCommand(commandInput),
      PUT: new PutObjectCommand(commandInput),
      DELETE: new DeleteObjectCommand(commandInput),
    }[commandType];

    // new GetObjectCommand({ Bucket: this.bucketName, Key:key})
    const objectSignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600, // 1h
      ...opts,
    });
    return objectSignedUrl;
  }

  // Return a public link to S3 object
  // e.g. https://storage.yandexcloud.net/ytdl-service/2KX6ESUP4cy-q7D8bouYL
  async getItemPublicLink(key: string) {
    const customEndpoint = this.s3Client.config.endpoint;
    if (customEndpoint) {
      const endpoint = await customEndpoint();

      const endpointUrl = new URL(
        `${endpoint.protocol}//${endpoint.hostname}`
      );
      if (endpoint.port) {
        endpointUrl.port = `${endpoint.port}`;
      }
      endpointUrl.pathname = `${this.bucketName}/${key}`;
      return endpointUrl.href;
    } else {
      return;
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

  async *list() {
    let isTruncated: boolean = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        ContinuationToken: continuationToken,
      });
      const listResult: ListObjectsV2CommandOutput =
        await this.s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        for (const object of listResult.Contents) {
          if (object.Key) {
            yield object.Key;
          }
        }
      }

      isTruncated = listResult.IsTruncated ?? false;
      continuationToken = listResult.NextContinuationToken;
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
