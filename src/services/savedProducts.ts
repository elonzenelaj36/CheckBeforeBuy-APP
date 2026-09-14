import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedProduct = {
  id: string;
  name: string;
  imageUri: string;
};

const SAVED_PRODUCTS_KEY = '@check_before_buy_saved_products';

export const getSavedProducts = async (): Promise<SavedProduct[]> => {
  try {
    const data = await AsyncStorage.getItem(
      SAVED_PRODUCTS_KEY
    );

    if (!data) {
      return [];
    }

    return JSON.parse(data);
  } catch (error) {
    console.log('Error loading saved products:', error);
    return [];
  }
};

export const saveProduct = async (
  product: SavedProduct
): Promise<void> => {
  try {
    const existingProducts = await getSavedProducts();

    const updatedProducts = [
      product,
      ...existingProducts,
    ];

    await AsyncStorage.setItem(
      SAVED_PRODUCTS_KEY,
      JSON.stringify(updatedProducts)
    );
  } catch (error) {
    console.log('Error saving product:', error);
  }
};

export const deleteSavedProduct = async (
  productId: string
): Promise<void> => {
  try {
    const existingProducts = await getSavedProducts();

    const updatedProducts = existingProducts.filter(
      (product) => product.id !== productId
    );

    await AsyncStorage.setItem(
      SAVED_PRODUCTS_KEY,
      JSON.stringify(updatedProducts)
    );
  } catch (error) {
    console.log('Error deleting saved product:', error);
  }
};