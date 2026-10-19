import { toMoney } from '../../common/http/money.js';
import type { Category, Product, ProductImage } from '../../generated/prisma/client.js';

type CategoryWithCount = Category & { _count: { products: number } };
type ProductWithRelations = Product & {
  category: Category;
  images: ProductImage[];
};

export function toCategory(category: CategoryWithCount) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    position: category.position,
    productCount: category._count.products,
  };
}

export function toProductListItem(
  product: ProductWithRelations,
  publicUrl: (key: string) => string,
) {
  const thumb = product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: { id: product.category.id, slug: product.category.slug, name: product.category.name },
    price: toMoney(product.priceAmount, product.currency),
    stock: product.stock,
    inStock: product.stock > 0,
    thumbnailUrl: thumb ? publicUrl(thumb.key) : null,
    createdAt: product.createdAt.toISOString(),
  };
}

export function toProductDetail(product: ProductWithRelations, publicUrl: (key: string) => string) {
  return {
    ...toProductListItem(product, publicUrl),
    sku: product.sku,
    description: product.description,
    images: product.images.map((image) => ({
      id: image.id,
      url: publicUrl(image.key),
      alt: image.alt,
      position: image.position,
    })),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toAdminProduct(product: ProductWithRelations, publicUrl: (key: string) => string) {
  return {
    ...toProductDetail(product, publicUrl),
    status: product.status,
    archivedAt: product.archivedAt?.toISOString() ?? null,
  };
}

export function toProductImageDto(image: ProductImage, publicUrl: (key: string) => string) {
  return {
    id: image.id,
    url: publicUrl(image.key),
    alt: image.alt,
    position: image.position,
  };
}
