const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) * INV_SQRT_2PI;
}

// Abramowitz-Stegun 7.1.26. The maximum absolute error is below 7.5e-8.
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x < 0 ? 0 : 1;
  const absolute = Math.abs(x);
  const t = 1 / (1 + 0.231_641_9 * absolute);
  const polynomial = t * (
    0.319_381_530
      + t * (-0.356_563_782
        + t * (1.781_477_937
          + t * (-1.821_255_978 + t * 1.330_274_429)))
  );
  const positive = 1 - normalPdf(absolute) * polynomial;
  return x >= 0 ? positive : 1 - positive;
}

// Peter J. Acklam's inverse-normal rational approximation.
export function normalInverse(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new RangeError("probability must be in (0, 1)");
  const a = [-39.696_830_286_653_76, 220.946_098_424_520_5, -275.928_510_446_968_7, 138.357_751_867_269, -30.664_798_066_147_16, 2.506_628_277_459_239];
  const b = [-54.476_098_798_224_06, 161.585_836_858_040_9, -155.698_979_859_886_6, 66.801_311_887_719_72, -13.280_681_552_885_72];
  const c = [-0.007_784_894_002_430_293, -0.322_396_458_041_136_5, -2.400_758_277_161_838, -2.549_732_539_343_734, 4.374_664_141_464_968, 2.938_163_982_698_783];
  const d = [0.007_784_695_709_041_462, 0.322_467_129_070_039_8, 2.445_134_137_142_996, 3.754_408_661_907_416];
  const low = 0.02425;
  const high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!)
      / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!)
      / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q
    / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}
