# s3-localstorage

Small and simple `localStorage`-compatible adaptor for S3-compatible storages (wrapper around `@aws-sdk/client-s3`).

## Installation

```sh
npm install s3-localstorage
```

## Setup

### AWS

- Open [AWS Console](https://console.aws.amazon.com/console/home) or similar

- Go to [IAM](https://console.aws.amazon.com/iam/home#/users) > Users

- Create a new user

- Enter user name and on "Set permissions" select `Attach policies directly`

- Search for and select `S3FullAccess` permission (or manually select `admin`, `editor` and `viewer` roles)

- Go to created user, click "Create access key", select `Application running outside AWS`

- Copy `Access key` and `Secret access key`

- Provide these to this package by preloading into `process.env`

## Usage

```ts
import S3LocalStorage from "s3-localstorage";

const main = async () => {
  // throws `NoSuchBucket` error, if the specified bucket doesn't exist
  const storage = new S3LocalStorage("user-bucket", {
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  await storage.setItem(
    "user",
    JSON.stringify({ id: 3923, name: "nezort11" })
  );

  const user = await storage.getItem("user");
  console.log("user from s3", user);
};
```
