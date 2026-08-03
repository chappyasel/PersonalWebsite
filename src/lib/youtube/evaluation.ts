export type EvaluationPair = { predicted: number; actual: number };

export function evaluateScores(pairs: EvaluationPair[]) {
  if (pairs.length === 0) {
    return {
      count: 0,
      mae: null,
      bias: null,
      withinOne: null,
      correlation: null,
    };
  }
  const errors = pairs.map((pair) => pair.predicted - pair.actual);
  const mae =
    errors.reduce((sum, error) => sum + Math.abs(error), 0) / pairs.length;
  const bias = errors.reduce((sum, error) => sum + error, 0) / pairs.length;
  const withinOne =
    errors.filter((error) => Math.abs(error) <= 1).length / pairs.length;
  const predictedMean =
    pairs.reduce((sum, pair) => sum + pair.predicted, 0) / pairs.length;
  const actualMean =
    pairs.reduce((sum, pair) => sum + pair.actual, 0) / pairs.length;
  let covariance = 0;
  let predictedVariance = 0;
  let actualVariance = 0;
  for (const pair of pairs) {
    const predictedDelta = pair.predicted - predictedMean;
    const actualDelta = pair.actual - actualMean;
    covariance += predictedDelta * actualDelta;
    predictedVariance += predictedDelta ** 2;
    actualVariance += actualDelta ** 2;
  }
  const denominator = Math.sqrt(predictedVariance * actualVariance);
  return {
    count: pairs.length,
    mae,
    bias,
    withinOne,
    correlation: denominator > 0 ? covariance / denominator : null,
  };
}
