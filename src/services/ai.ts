export type ProductAnalysis = {
  score: number;
  recommendation: 'BUY' | 'CONSIDER' | 'SKIP';
  summary: string;
  pros: string[];
  cons: string[];
};

export async function analyzeProduct(
  productId: string
): Promise<ProductAnalysis> {
  await new Promise((resolve) =>
    setTimeout(resolve, 800)
  );

  return {
    score: 86,
    recommendation: 'BUY',
    summary:
      'This product looks like a strong match based on price, quality, style, and overall value.',

    pros: [
      'Good price for the category',
      'Strong customer rating',
      'Modern and versatile design',
      'Good fit for most spaces',
    ],

    cons: [
      'Limited color options',
      'Delivery time may vary',
    ],
  };
}