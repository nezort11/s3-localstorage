# s3-localstorage

Small and simple `localStorage`-compatible adaptor S3-compatible storages (wrapper around `@aws-sdk/client-s3`).

## Installation

```sh
npm install s3-localstorage
```

## Usage

```ts
import S3LocalStorage from "s3-localstorage";

const main = async () => {
  // will automatically provision bucket for you
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
