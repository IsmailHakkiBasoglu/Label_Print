// Test-only cross-check encoder; its internal modules ship without types.
declare module "jsbarcode/bin/barcodes/*" {
  const Encoder: new (data: string, options: object) => { encode(): unknown };
  export default Encoder;
}
