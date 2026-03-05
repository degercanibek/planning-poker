// ─── Voting Scales ──────────────────────────────────────────────────────────
const SCALES = {
  fibonacci: {
    name: 'Fibonacci', icon: '🔢',
    values: ['0','1','2','3','5','8','13','21','34','55','89','?','☕'],
    labels: { '?':'Not Sure', '☕':'Break' },
    numeric: { '0':0,'1':1,'2':2,'3':3,'5':5,'8':8,'13':13,'21':21,'34':34,'55':55,'89':89 }
  },
  modified_fibonacci: {
    name: 'Modified Fibonacci', icon: '📊',
    values: ['0','½','1','2','3','5','8','13','20','40','100','?','☕'],
    labels: { '?':'Not Sure', '☕':'Break' },
    numeric: { '0':0,'½':0.5,'1':1,'2':2,'3':3,'5':5,'8':8,'13':13,'20':20,'40':40,'100':100 }
  },
  tshirt: {
    name: 'T-Shirt Size', icon: '👕',
    values: ['XS','S','M','L','XL','XXL','?','☕'],
    labels: { 'XS':'Extra Small','S':'Small','M':'Medium','L':'Large','XL':'Extra Large','XXL':'Huge','?':'Not Sure','☕':'Break' },
    numeric: { 'XS':1,'S':2,'M':3,'L':5,'XL':8,'XXL':13 }
  },
  powers: {
    name: 'Powers of 2', icon: '⚡',
    values: ['0','1','2','4','8','16','32','64','?','☕'],
    labels: { '?':'Not Sure', '☕':'Break' },
    numeric: { '0':0,'1':1,'2':2,'4':4,'8':8,'16':16,'32':32,'64':64 }
  },
  fun: {
    name: 'Effort Menu', icon: '🍽️',
    values: ['🍰','🧁','🍕','🍔','🥩','🦃','🐄','🐘','🏔️','🌋','🤷','☕'],
    labels: {
      '🍰':'Piece of Cake (1)','🧁':'Easy Peasy (2)','🍕':'Small Bite (3)',
      '🍔':'Normal (5)','🥩':'Challenging (8)','🦃':'Pretty Big (13)',
      '🐄':'Huge (21)','🐘':'Mammoth (34)','🏔️':'Himalaya (55)',
      '🌋':'Impossible (89)','🤷':'No Idea','☕':'Break!'
    },
    numeric: { '🍰':1,'🧁':2,'🍕':3,'🍔':5,'🥩':8,'🦃':13,'🐄':21,'🐘':34,'🏔️':55,'🌋':89 }
  }
};

module.exports = SCALES;
