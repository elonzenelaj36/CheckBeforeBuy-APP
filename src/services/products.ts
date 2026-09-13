import { Product } from '@/components/ProductCard';

export const products: Product[] = [
  {
    id: '1',
    name: 'Nordic Lounge Chair',
    brand: 'HomeLine',
    category: 'Chair',
    price: 189.99,
    store: 'Example Home',
    image:
      'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91',
    rating: 4.6,
  },

  {
    id: '2',
    name: 'Modern Oak Table',
    brand: 'WoodCraft',
    category: 'Table',
    price: 329.99,
    store: 'Example Home',
    image:
      'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc',
    rating: 4.8,
  },

  {
    id: '3',
    name: 'Minimal Sofa',
    brand: 'LivingCo',
    category: 'Sofa',
    price: 699.99,
    store: 'Home Center',
    image:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc',
    rating: 4.5,
  },

  {
    id: '4',
    name: 'Modern Floor Lamp',
    brand: 'LightHouse',
    category: 'Lighting',
    price: 119.99,
    store: 'Design House',
    image:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c',
    rating: 4.4,
  },

  {
    id: '5',
    name: 'Scandinavian Shelf',
    brand: 'NordicHome',
    category: 'Storage',
    price: 249.99,
    store: 'Example Home',
    image:
      'https://images.unsplash.com/photo-1594620302200-9a762244a156',
    rating: 4.7,
  },
];

export function getProductById(
  id: string
): Product | undefined {
  return products.find(
    (product) => product.id === id
  );
}