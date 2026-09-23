/**
 * GST reference data (rates as per GST rate notifications effective 22 Sep 2025)
 */

export interface IndianState { code: string; name: string; }

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' }, { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' },
];

export const stateNameFromCode = (code: string): string =>
  INDIAN_STATES.find((s) => s.code === code)?.name || '';

export interface GstRateRef {
  item: string;
  hsn: string;
  loose: number;  // sold loose / weighed in front of customer
  packed: number; // pre-packaged and labelled
}

export const GST_RATE_REFERENCE: GstRateRef[] = [
  { item: 'Rice', hsn: '1006', loose: 0, packed: 5 },
  { item: 'Wheat', hsn: '1001', loose: 0, packed: 5 },
  { item: 'Atta / wheat flour', hsn: '1101', loose: 0, packed: 5 },
  { item: 'Suji / rava / dalia', hsn: '1103', loose: 0, packed: 5 },
  { item: 'Besan / pulse flour', hsn: '1106', loose: 0, packed: 5 },
  { item: 'Dal / pulses (dried)', hsn: '0713', loose: 0, packed: 5 },
  { item: 'Sugar', hsn: '1701', loose: 5, packed: 5 },
  { item: 'Jaggery (gur)', hsn: '1701', loose: 0, packed: 5 },
  { item: 'Salt', hsn: '2501', loose: 0, packed: 0 },
  { item: 'Edible oil', hsn: '1508', loose: 5, packed: 5 },
  { item: 'Ghee / butter', hsn: '0405', loose: 5, packed: 5 },
  { item: 'Fresh milk / UHT milk', hsn: '0401', loose: 0, packed: 0 },
  { item: 'Paneer', hsn: '0406', loose: 0, packed: 0 },
  { item: 'Cheese', hsn: '0406', loose: 5, packed: 5 },
  { item: 'Curd / lassi / buttermilk', hsn: '0403', loose: 0, packed: 5 },
  { item: 'Eggs', hsn: '0407', loose: 0, packed: 0 },
  { item: 'Fresh vegetables', hsn: '0709', loose: 0, packed: 0 },
  { item: 'Fresh fruits', hsn: '0810', loose: 0, packed: 0 },
  { item: 'Dry fruits / nuts', hsn: '0802', loose: 5, packed: 5 },
  { item: 'Tea', hsn: '0902', loose: 5, packed: 5 },
  { item: 'Coffee', hsn: '0901', loose: 5, packed: 5 },
  { item: 'Spices (whole / ground)', hsn: '0910', loose: 5, packed: 5 },
  { item: 'Biscuits / rusk / cakes', hsn: '1905', loose: 5, packed: 5 },
  { item: 'Namkeen / bhujia / mixture', hsn: '2106', loose: 5, packed: 5 },
  { item: 'Noodles / pasta', hsn: '1902', loose: 5, packed: 5 },
  { item: 'Cornflakes / breakfast cereals', hsn: '1904', loose: 5, packed: 5 },
  { item: 'Chocolates', hsn: '1806', loose: 5, packed: 5 },
  { item: 'Sweets / sugar confectionery', hsn: '1704', loose: 5, packed: 5 },
  { item: 'Jam / sauce / ketchup', hsn: '2103', loose: 5, packed: 5 },
  { item: 'Fruit juice', hsn: '2009', loose: 5, packed: 5 },
  { item: 'Packaged drinking water', hsn: '2201', loose: 5, packed: 5 },
  { item: 'Aerated / sugary soft drinks', hsn: '2202', loose: 40, packed: 40 },
  { item: 'Toilet soap', hsn: '3401', loose: 5, packed: 5 },
  { item: 'Shampoo / hair oil', hsn: '3305', loose: 5, packed: 5 },
  { item: 'Toothpaste / tooth powder', hsn: '3306', loose: 5, packed: 5 },
  { item: 'Toothbrush', hsn: '9603', loose: 5, packed: 5 },
  { item: 'Agarbatti / dhoop', hsn: '3307', loose: 5, packed: 5 },
  { item: 'Matchbox', hsn: '3605', loose: 5, packed: 5 },
  { item: 'Detergent / washing powder', hsn: '3402', loose: 18, packed: 18 },
  { item: 'Floor / toilet cleaner', hsn: '3402', loose: 18, packed: 18 },
  { item: 'Mosquito repellent', hsn: '3808', loose: 18, packed: 18 },
  { item: 'Batteries', hsn: '8506', loose: 18, packed: 18 },
  { item: 'Sanitary napkins', hsn: '9619', loose: 0, packed: 0 },
  { item: 'Cigarettes / tobacco / pan masala', hsn: '2402', loose: 40, packed: 40 },
];
