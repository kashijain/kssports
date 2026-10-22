const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under100(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one ? `${TENS[ten]} ${ONES[one]}` : (TENS[ten] ?? '');
}

function under1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${ONES[hundreds]} Hundred` : '';
  if (!rest) return head;
  return head ? `${head} ${under100(rest)}` : under100(rest);
}

function indianIntegerWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${crore > 999 ? indianIntegerWords(crore) : under1000(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}

/** Indian grouping: "One Thousand One Hundred Eighty Rupees Only". */
export function amountInWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees < 0) return '';
  const paiseTotal = Math.round(rupees * 100);
  const rupeePart = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const rupeeWords = rupeePart === 0 ? 'Zero' : indianIntegerWords(rupeePart);
  const rupeeLabel = rupeePart === 1 ? 'Rupee' : 'Rupees';
  if (paise === 0) return `${rupeeWords} ${rupeeLabel} Only`;
  const paiseLabel = paise === 1 ? 'Paisa' : 'Paise';
  return `${rupeeWords} ${rupeeLabel} and ${under100(paise)} ${paiseLabel} Only`;
}
