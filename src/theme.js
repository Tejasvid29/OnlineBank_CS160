export const colors = {
  navy: '#073B66',
  blue: '#005EB8',
  blueDark: '#004B93',
  sky: '#EAF4FC',
  ink: '#18334B',
  muted: '#5D7182',
  border: '#DCE5EB',
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  green: '#18734B',
  red: '#B53139',
  amber: '#8F5D00',
};

export const money = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export const dateLabel = (value) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
