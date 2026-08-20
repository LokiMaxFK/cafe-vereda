import type { Category, Product } from "../domain/types";

export const categories: Category[] = [
  { id: "coffee", name: "Café", position: 0 },
  { id: "cold", name: "Frías", position: 1 },
  { id: "breakfast", name: "Almuerzos", position: 2 },
  { id: "sandwiches", name: "Bagels y chapatas", position: 3 },
  { id: "salads", name: "Ensaladas", position: 4 },
  { id: "crepes", name: "Crepas", position: 5 },
  { id: "bakery", name: "Otros", position: 6 }
];

const hotCold = (hot: number, cold: number) => [
  { id: "hot", name: "Caliente", price: hot },
  { id: "cold", name: "Frío / frappé", price: cold }
];

export const products: Array<Omit<Product, "seasonal">> = [
  { id: "espresso", categoryId: "coffee", name: "Espresso", price: 48, available: true },
  { id: "americano", categoryId: "coffee", name: "Americano", price: 55, variants: hotCold(55, 60), available: true },
  { id: "flat-white", categoryId: "coffee", name: "Flat White", price: 65, available: true },
  { id: "cappuccino", categoryId: "coffee", name: "Cappuccino", price: 70, variants: hotCold(70, 90), available: true },
  { id: "latte", categoryId: "coffee", name: "Latte", price: 70, variants: hotCold(70, 90), available: true },
  { id: "moka", categoryId: "coffee", name: "Moka", price: 90, variants: hotCold(90, 95), available: true },
  { id: "chai", categoryId: "coffee", name: "Chai", price: 80, variants: hotCold(80, 90), available: true },
  { id: "matcha", categoryId: "coffee", name: "Matcha", price: 80, variants: hotCold(80, 90), available: true },
  { id: "taro", categoryId: "coffee", name: "Taro", price: 80, variants: hotCold(80, 90), available: true },
  { id: "chocolate", categoryId: "coffee", name: "Chocolate", price: 80, variants: hotCold(80, 90), available: true },
  { id: "aeropress", categoryId: "coffee", name: "Aeropress", description: "Grano de tolva", price: 65, available: true },
  { id: "jugo-verde", categoryId: "cold", name: "Jugo verde", description: "Espinaca, apio, mango y piña", price: 70, available: true },
  { id: "smoothie-frutos", categoryId: "cold", name: "Smoothie frutos", description: "Frutos rojos y avena", price: 85, available: true },
  { id: "licuado-choplatano", categoryId: "cold", name: "Licuado choplátano", description: "Plátano y chocolate amargo", price: 80, available: true },
  { id: "chilaquiles", categoryId: "breakfast", name: "Chilaquiles", description: "Salsa verde o roja, huevo y aguacate", price: 120, available: true },
  { id: "chilaquiles-vereda", categoryId: "breakfast", name: "Chilaquiles Vereda", description: "Con pollo, res, machacado o pastor", price: 130, available: true },
  { id: "huevos-divorciados", categoryId: "breakfast", name: "Huevos divorciados", price: 115, available: true },
  { id: "omelette", categoryId: "breakfast", name: "Omelette al gusto", price: 130, available: true },
  { id: "nortenito", categoryId: "breakfast", name: "Norteñito", description: "Burrito de huevo con machacado", price: 145, available: true },
  { id: "sandwich-pavo", categoryId: "sandwiches", name: "Sándwich de pavo", price: 100, available: true },
  { id: "bagel-serrano", categoryId: "sandwiches", name: "Bagel serrano", description: "Jamón serrano y ensalada dulce", price: 145, available: true },
  { id: "chapata-pollo", categoryId: "sandwiches", name: "Chapata pollo naranja", price: 125, available: true },
  { id: "ensalada-verde", categoryId: "salads", name: "Ensalada Verde", price: 110, available: true },
  { id: "ensalada-huerto", categoryId: "salads", name: "Ensalada Huerto", price: 105, available: true },
  { id: "ensalada-vereda", categoryId: "salads", name: "Ensalada Vereda", price: 110, available: true },
  { id: "crepa-nogal", categoryId: "crepes", name: "Crepa Nogal", description: "Cajeta y nuez", price: 95, available: true },
  { id: "crepa-manazana", categoryId: "crepes", name: "Delicia de manzana", price: 97, available: true },
  { id: "crepa-rajas", categoryId: "crepes", name: "Crepa de rajas poblanas", price: 95, available: true },
  { id: "crepa-pastor", categoryId: "crepes", name: "Crepa de pastor", price: 115, available: true },
  { id: "galleta", categoryId: "bakery", name: "Galleta", price: 30, available: true },
  { id: "panque", categoryId: "bakery", name: "Panqué del día", price: 35, available: true },
  { id: "pastel", categoryId: "bakery", name: "Pastel", price: 50, available: true },
  { id: "affogato", categoryId: "bakery", name: "Affogato", price: 90, available: true }
];

export const commonModifiers = [
  { id: "plant-milk", name: "Bebida vegetal", price: 15 },
  { id: "extra-shot", name: "Carga extra", price: 15 },
  { id: "extra-flavor", name: "Sabor extra", price: 15 }
];
