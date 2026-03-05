// ─── Voting Scales ──────────────────────────────────────────────────────────
const SCALES = {
  fibonacci: {
    name: 'Fibonacci', icon: '🔢',
    values: ['0','1','2','3','5','8','13','21','34','55','89','?','☕'],
    labels: { '?':'Bilmiyorum', '☕':'Mola' },
    numeric: { '0':0,'1':1,'2':2,'3':3,'5':5,'8':8,'13':13,'21':21,'34':34,'55':55,'89':89 }
  },
  modified_fibonacci: {
    name: 'Değiştirilmiş Fibonacci', icon: '📊',
    values: ['0','½','1','2','3','5','8','13','20','40','100','?','☕'],
    labels: { '?':'Bilmiyorum', '☕':'Mola' },
    numeric: { '0':0,'½':0.5,'1':1,'2':2,'3':3,'5':5,'8':8,'13':13,'20':20,'40':40,'100':100 }
  },
  tshirt: {
    name: 'T-Shirt Bedeni', icon: '👕',
    values: ['XS','S','M','L','XL','XXL','?','☕'],
    labels: { 'XS':'Çok Küçük','S':'Küçük','M':'Orta','L':'Büyük','XL':'Çok Büyük','XXL':'Devasa','?':'Bilmiyorum','☕':'Mola' },
    numeric: { 'XS':1,'S':2,'M':3,'L':5,'XL':8,'XXL':13 }
  },
  powers: {
    name: '2\'nin Kuvvetleri', icon: '⚡',
    values: ['0','1','2','4','8','16','32','64','?','☕'],
    labels: { '?':'Bilmiyorum', '☕':'Mola' },
    numeric: { '0':0,'1':1,'2':2,'4':4,'8':8,'16':16,'32':32,'64':64 }
  },
  fun: {
    name: 'Efor Menüsü', icon: '🍽️',
    values: ['🍰','🧁','🍕','🍔','🥩','🦃','🐄','🐘','🏔️','🌋','🤷','☕'],
    labels: {
      '🍰':'Çocuk Oyuncağı (1)','🧁':'Kolay İş (2)','🍕':'Ufak Tefek (3)',
      '🍔':'Normal (5)','🥩':'Zorlayıcı (8)','🦃':'Bayağı Büyük (13)',
      '🐄':'Devasa (21)','🐘':'Mamut Gibi (34)','🏔️':'Himalaya (55)',
      '🌋':'İmkansız (89)','🤷':'Fikrim Yok','☕':'Mola!'
    },
    numeric: { '🍰':1,'🧁':2,'🍕':3,'🍔':5,'🥩':8,'🦃':13,'🐄':21,'🐘':34,'🏔️':55,'🌋':89 }
  }
};

module.exports = SCALES;
