-- Add Sea Battle as a game.
alter table game_tables drop constraint game_tables_game_check;
alter table game_tables add constraint game_tables_game_check check (game in ('chess', 'backgammon', 'tichu', 'seabattle'));
update users set ratings = ratings || '{"seabattle":{"r":1500,"n":0}}'::jsonb where not ratings ? 'seabattle';
alter table users alter column ratings set default '{"chess":{"r":1500,"n":0},"backgammon":{"r":1500,"n":0},"tichu":{"r":1500,"n":0},"seabattle":{"r":1500,"n":0}}';
