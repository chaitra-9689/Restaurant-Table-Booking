-- Starter data; only inserted when the tables are empty.

insert into restaurant_tables (name, capacity, area)
select * from (values
  ('T1', 2, 'Window'), ('T2', 2, 'Window'), ('T3', 2, 'Window'),
  ('T4', 4, 'Main'),   ('T5', 4, 'Main'),   ('T6', 4, 'Main'),
  ('T7', 6, 'Main'),   ('T8', 6, 'Terrace'),
  ('T9', 8, 'Private room'), ('T10', 10, 'Private room')
) v(name, capacity, area)
where not exists (select 1 from restaurant_tables);

insert into menu_items (category, name, description, price, is_featured, sort_order)
select * from (values
  ('Starters', 'Burrata',               'Heirloom tomatoes, basil oil, sourdough',          18.00, true,  1),
  ('Starters', 'Beef carpaccio',        'Rocket, parmesan, capers, lemon',                  21.00, false, 2),
  ('Starters', 'Fritto misto',          'Calamari, prawns, zucchini, aioli',                19.00, false, 3),
  ('Pasta',    'Tagliatelle al ragù',   'Slow-cooked beef & pork ragù, parmigiano',         26.00, true,  1),
  ('Pasta',    'Cacio e pepe',          'Tonnarelli, pecorino romano, black pepper',        22.00, false, 2),
  ('Pasta',    'Lobster linguine',      'Half lobster, cherry tomato, chilli, garlic',      42.00, true,  3),
  ('Mains',    'Wood-fired branzino',   'Salsa verde, charred lemon, potatoes',             38.00, false, 1),
  ('Mains',    'Bistecca',              '500g dry-aged ribeye, rosemary, sea salt',         68.00, true,  2),
  ('Mains',    'Mushroom risotto',      'Porcini, truffle butter, aged parmesan',           28.00, false, 3),
  ('Desserts', 'Tiramisù',              'Mascarpone, espresso, savoiardi',                  14.00, true,  1),
  ('Desserts', 'Panna cotta',           'Vanilla, seasonal berries',                        12.00, false, 2)
) v(category, name, description, price, is_featured, sort_order)
where not exists (select 1 from menu_items);
