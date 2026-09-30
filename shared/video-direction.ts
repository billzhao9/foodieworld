/** Applies to cached as well as newly planned openings. Keep the outcome food-led. */
export function foodPresentationPrompt(action: string): string {
  return `${action}\nAfter one brief cooking beat, utensils lift the finished food out onto the foreground serving plate. The plated food fills the view: golden edges, glossy sauce, juicy texture and a delicate cheese pull or topping bounce. Keep it plated and appetizing. The appliance rests behind it. Never repeat door opening, closing or plating. No full human bodies; retain the stylized miniature scene.`;
}
