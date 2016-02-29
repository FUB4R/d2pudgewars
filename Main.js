// PudgeWars plugin for Dota2 SMJS by Fubar
// Some code taken from other plugins : LegendsOfDota, MidOnly, Dotax2, InstantRespawn, Blind...

/* STUFF THAT NEEDS TO BE POSSIBLE
 *
 * Spawn trees at arbitrary locations, that can't be destroyed (or just respawn instantly)
 * Modify hook damage
 * Modify ability cooldowns
 * Forced spend first ability point on hook
 * 
 */
/* TODO
 * 
 * fix radiant spawn (near ancients)
 * increase respawn to 3-5 secs
 * test other spells : swap, ban, shukuchi, wave of terror, X marks, etc.
 * make map edges elastic (instead of hard)
 * toss cd
 * res timer
 
   BALANCE
 * hook slightly faster
 * lower rupture damage
 */

// Default hook attributes in Dota :
// Range  : 700-1300
// Speed  : 1600
// Width  : 100
// Damage : 90-360

// Default chain attributes in Dota :
// Radius : 90
// Speed : 1600-2800
// Range : 850-1450
// Dmg radius : 225
// Damage : 100-220

// Default toss attributes in Dota :
// Grab radius   : 250
// Damage radius : 275
// Damage        : 75-300
// Bonus damage  : 20%

// Default rupture attributes in Dota :
/* duration				7-9
   movement_damage_pct	20-60
   damage_cap_amount	200
   damage_cap_interval	0.25
*/

/* IDEA
damage : ursa like with troll + veno attacks
same pudge?
potm-like with glimpse
*/

/* PRACTICAL STUFF
	var client = dota.findClientByPlayerID(playerId);
	var playerId = client.netprops.m_iPlayerID
    var hero;
    if(client != null)
	if (!client.isInGame())
    var hero = client.netprops.m_hAssignedHero;
	
	playerManager.netprops.m_iReliableGold[playerId]
*/

// KV file which contains a bunch of configuration values, mostly balance stuff
var kv = keyvalue.parseKVFile('PudgeWars.kv');

// Max number of players
var MAX_PLAYERS = 16;

// Holds the current level that each player has for the various hook attributes
var initialized = false;
var pudges = new Array(MAX_PLAYERS);

var cvForceGameMode    = console.findConVar("dota_force_gamemode");
var cvEasyMode         = console.findConVar("dota_easy_mode");
var cvCreepsNoSpawning = console.findConVar("dota_creeps_no_spawning");
var cvAbilityDebug     = console.findConVar("dota_ability_debug");

var playerManager = null;

console.addClientCommand("tp", tp);
console.addClientCommand("pos", pos);
console.addClientCommand("ab", ab);

var ablvl_test = 1;

function tp(client, args)
{
	if (args.length < 3) return;
	dota.findClearSpaceForUnit(client.netprops.m_hAssignedHero, parseInt(args[0]), parseInt(args[1]), parseInt(args[2]));
}
function pos(client, args)
{
	var hero = client.netprops.m_hAssignedHero;
	client.printToChat(hero.netprops.m_vecOrigin.x + " " + hero.netprops.m_vecOrigin.y);
	print("SADADCASFGADJGFNEQAI  "+hero.netprops.m_flRespawnTime+" "+hero.netprops.m_bReincarnating+" "+hero.netprops.m_lifeState);
	print(hero.netprops.m_hAbilities[0].netprops.m_fCooldown, hero.netprops.m_hAbilities[0].netprops.m_flCooldownLength, hero.netprops.m_hAbilities[0].netprops.m_iCastRange);
	
}
function ab(client, args)
{
	if (args.length < 1) return;
	ablvl_test = parseInt(args[0]);
}

function OnMapStart()
{
	initialized = false;
	playerManager = game.findEntityByClassname(-1, "dota_player_manager");
	
	// Move T1 towers out of the way
	tower = game.findEntityByTargetname("dota_goodguys_tower1_mid");
	if (tower != null) tower.teleport(-2123, -3754, 128); // somewhere near the T2....
	tower = game.findEntityByTargetname("dota_badguys_tower1_mid");
	if (tower != null) tower.teleport(1838, 2647, 128);
	tower = game.findEntityByTargetname("dota_badguys_fountain");
	if (tower != null) tower.teleport(0, 0, 128);
	
	// Initialize the pudges
	for (var i = 0; i < MAX_PLAYERS; i++)
	{
		pudges[i] = {"AbLvl" : {}, "respawned" : 0};
		for (var j in kv.AbilityVals)
		{
			pudges[i]["AbLvl"][j] = 0;
			/*for (var k in kv.AbilityVals[j])
			{
				// This could be e.g. i=0, j="pudge_meat_hook", k="hook_radius"
				pudges[i]["AbLvl"][j][k] = 0;
			}*/
		}
	}
}

function OnGameFrame()
{
	if (!initialized)
	{
		// These have to be put here because hibernation wakeup will overwrite stuff from OnMapStart
		cvForceGameMode.setInt(11);   // Mid Only mode
		cvCreepsNoSpawning.setInt(1); // No creeps
		cvAbilityDebug.setInt(1);     // WTF mode
		//cvEasyMode.setInt(1);         // Easymode (disabled because doesn't add anything)
		
	}
	
	for(var i = 0; i < server.clients.length; ++i){
		if(server.clients[i] == null) continue;
		if(!server.clients[i].isInGame()) continue;
		
		var pID = server.clients[i].netprops.m_iPlayerID;
		if(pID == -1) continue;
		var hero = server.clients[i].netprops.m_hAssignedHero;
		if(hero == null) continue;
		
		// Passive HP regeneration
		hero.netprops.m_iHealth += kv.GameProps.HPregen;
		
		// m_flRespawnTime is actually the time when the hero died I think.
		// Just set it to 1.0 and it should respawn instantly
		// If the hero is alive its value is -1 I think
		hero.netprops.m_flRespawnTime -= 1;
		res_time = hero.netprops.m_flRespawnTime;/*
		if (res_time != 0 && res_time != -1)
			server.clients[i].printToChat(res_time+" "+hero.netprops.m_bReincarnating);
		if(res_time >= 100.0 && !hero.netprops.m_bReincarnating){
			hero.netprops.m_flRespawnTime = 35;
			pudges[pID].respawned = 0;
			continue;
		}*/
		
		for (var j = 0; j < 6; j++)
		{
			if (ab = hero.netprops.m_hAbilities[j])
			{
				var a_cls = ab.getClassname();
				pudges[pID]["AbLvl"][a_cls]++;
				
				var a_lvl = ab.netprops.m_iLevel;
				var p_lvl = pudges[pID]["AbLvl"][a_cls];
				var a_kv  = kv.AbilityVals[a_cls];
				if (a_kv)
				{
						
					//if (ab.getClassname() == "pudge_meat_hook") print(ab.netprops.m_bActivated, ab.netprops.m_bToggleState, ab.netprops.m_bInAbilityPhase, ab.netprops.m_iDirtyButtons);
					
					/*if (ab.netprops.m_bInAbilityPhase)
					{
						pudges[pID]["AbLvl"][ab.getClassname()] = -10;
					}
					else*/
					
					if (p_lvl == -1)
					{
						ab.netprops.m_iLevel = 0;
					}
					else if (a_lvl < a_kv.max_charges && p_lvl >= 0)
					{
						if (p_lvl >= a_kv.charge_ticks[a_lvl])
						{
							ab.netprops.m_iLevel = a_lvl + 1;
							pudges[pID]["AbLvl"][a_cls] = 0;
						}
						//ab.netprops.m_iCastRange = 2500;
					}
				}
				
				//server.clients[i].printToChat(ab.netprops.m_fCooldownLength+" "+ab.netprops.m_fCooldown);
				//ab.netprops.m_iLevel = ablvl_test;
				// ANIM TIMEab.netprops.
				
				// TESTING DEBUG
				//if (ablvl_test > 0) ab.netprops.m_iLevel = ablvl_test;
			}
		}
		
		if (res_time <= 0 && !hero.netprops.m_bReincarnating && hero.netprops.m_lifeState == 0 && pudges[pID].respawned < 10)
		{
			pudges[pID].respawned++;
			
			if (pudges[pID].respawned == 2) {
				print("respawn "+kv.PlayerSpawns.dire.x+" "+kv.PlayerSpawns.dire.y);
				
				print(hero.netprops.m_hAbilities[0].netprops.m_fCooldown, hero.netprops.m_hAbilities[0].netprops.m_flCooldownLength, hero.netprops.m_hAbilities[0].netprops.m_iCastRange);
				
				respawnHero(hero);
			}
			continue;
		}
		
		// Everyone is level 25, and some ability point TODO
		if (hero.netprops.m_iCurrentLevel != 25)
		{
			dota.setHeroLevel(hero, 25);
			hero.netprops.m_iAbilityPoints = 0;
			
			//hero.netprops.m_hAbilities[0].netprops.m_iCastRange = 2500;
		}
		
		var px = hero.netprops.m_vecOrigin.x;
		var py = hero.netprops.m_vecOrigin.y;
		var len = kv.MapBounds.length;
		
		// Stuck spot by radiant ancients
		if (px >= -2097.0 && px <= -2096.0 && py <= 305.0 && py >= 304.0)
			respawnHero(hero);
			
		if (px >= 2000 || py >= 2000 || px <= -2000 || py <= -2000)
			respawnHero(hero);
		
		// Bound player positions
		for (var j = 0; j < len; j++)
		{
			if (isPointLeftOfLine(px, py, kv.MapBounds[j].x, kv.MapBounds[j].y, kv.MapBounds[(j+1) % len].x, kv.MapBounds[(j+1) % len].y))
			{
				var newpos = projectPointOnLine(px, py, kv.MapBounds[     j     ].x, kv.MapBounds[     j     ].y,
				                                        kv.MapBounds[(j+1) % len].x, kv.MapBounds[(j+1) % len].y);
				
				dota.findClearSpaceForUnit(hero, newpos.x, newpos.y, 0);
				continue;
			}
		}
		
		// No gold
		playerManager.netprops.m_iReliableGold[pID]   = 0;
		playerManager.netprops.m_iUnreliableGold[pID] = 0;
	}
}

// In these 2 functions, the (directed) line is defined by a vector going from (x1, y1) to (x2, y2)

// http://stackoverflow.com/a/2752753
function isPointLeftOfLine(xp, yp, x1, y1, x2, y2)
{
	var v = (x2 - x1) * (yp - y1) - (y2 - y1) * (xp - x1);
	return -250 >= v;
}
// http://en.wikibooks.org/wiki/Linear_Algebra/Orthogonal_Projection_Onto_a_Line
function projectPointOnLine(xp, yp, x1, y1, x2, y2)
{
	var s = { x : x1 - x2,
	          y : y1 - y2 };
	var v = { x : xp - x1,
	          y : yp - y1 };
			  
	var c = (s.x * v.x + s.y * v.y) / (s.x * s.x + s.y * s.y);
	
	return { x : x1 + c * s.x,
	         y : y1 + c * s.y };
}

function respawnHero(hero)
{
	// Testing hero respawn
	if (hero.netprops.m_iTeamNum == 3) // dire
	{
		dota.findClearSpaceForUnit(hero, kv.PlayerSpawns.dire.x,    kv.PlayerSpawns.dire.y,    0);
	} else {
		dota.findClearSpaceForUnit(hero, kv.PlayerSpawns.radiant.x, kv.PlayerSpawns.radiant.y, 0);
	}
}

function Dota_OnHeroPicked(client, clsname)
{
	// Everyone plays Pudge!
	print("PlayerID "+client.netprops.m_iPlayerID+" picked "+clsname);
	
	//return "npc_dota_hero_pudge";
	return "npc_dota_hero_invoker";
}

function Dota_OnBuyItem(unit, item, playerID, unknown)
{
	// Can't buy any items
	dota.findClientByPlayerID(playerID).printToChat("No items allowed.");
	return false;
}

function Dota_OnGetAbilityValue(ability, abilityName, field, values)
{
	// Player ID
	var pID = ability.netprops.m_hOwnerEntity.netprops.m_iPlayerID;
	
	if (!dota.findClientByPlayerID(pID)) return;
	
	print(ability.index+" "+abilityName+"."+field+" : "+JSON.stringify(values));
	
	// This works visually, but values are not taken into account by the game engine...
	//ability.netprops.m_iCastRange = 2500;
	//ability.netprops.m_flAnimTime = 0;
	//ability.netprops.m_iLevel = 0;
	
	//pudges[pID]["AbLvl"][abilityName] = -1;
	
	pudges[pID]["AbLvl"][abilityName] = -10;
	
	if (kv.AbilityVals[abilityName] != null)
	{
		// return base + incr * lvl for all values
		var f = kv.AbilityVals[abilityName][field];
		if (f != null)
		{
			/*//return values.map(function(v){ return f.Base + (f.Incr * pudges[pID]["AbLvl"][abilityName][field]); });
			for (var i = 0; i < values.length; i++)
			{
				values[i] = f.Base + i * f.Incr;
			}
			*/
			values = f;
			print("-> "+JSON.stringify(values));
			return values;
		}
	}
	/*
	if (abilityName == "rattletrap_hookshot")
	{
		print(JSON.stringify(ability));
		print(abilityName);
		print(field);
		print(JSON.stringify(values));
		print("Player: " + pID);
	}*/
}
function Dota_OnUnitParsed(unit, keyvalues)
{
	// Reduced vision range for all units (creeps, towers, heroes, etc.)
	keyvalues.VisionDaytimeRange   = kv.GameProps.Vision;
	keyvalues.VisionNighttimeRange = kv.GameProps.Vision;
	
	// Skip non-hero units
	if(dota.heroes.indexOf(unit.getClassname()) == -1) return;
	
	print(unit.getClassname()+" : "+unit.netprops.m_flAnimTime+" "+unit.netprops.m_hReplicatingOtherHeroModel);
	/*
	keyvalues.Model = "models/heroes/antimage/antimage.mdl";
	keyvalues.IdleExpression = "scenes/antimage/antimage_exp_idle_01.vcd";
	keyvalues.Portrait = "vgui/hud/heroportraits/portrait_antimage";
	keyvalues.ParticleFile = "particles/units/heroes/hero_antimage.pcf";
	*/
	//keyvalues.SoundSet = "Hero_Pudge";
	keyvalues.MovementTurnRate = "5";
	keyvalues.MovementSpeed = "300";
	keyvalues.AttackAnimationPoint = "0.1";
	keyvalues.AttackRange = "200";
	keyvalues.AttackDamageMin = "80";
	keyvalues.AttackDamageMax = "80";
	/*
	unit.netprops.m_flAnimTime = 0;
	unit.netprops.m_anglediff = 0;
	unit.netprops.m_flCycle = 0;
	*/
	
	// Replace abilities for pudge : hook, chain, toss, rupture
	keyvalues.Ability1 = "pudge_meat_hook";
	//keyvalues.Ability2 = "shredder_timber_chain";
	//keyvalues.Ability2 = "rattletrap_hookshot";
	keyvalues.Ability2 = "tiny_toss";
	//keyvalues.Ability3 = "kunkka_x_marks_the_spot";
	//keyvalues.Ability3 = "vengefulspirit_nether_swap";
	keyvalues.Ability3 = "slark_pounce";
	keyvalues.Ability4 = "weaver_shukuchi";
	keyvalues.Ability5 = "rattletrap_rocket_flare";
	keyvalues.Ability6 = "bloodseeker_rupture";
	// Need to load these manually
	game.precacheModel("models/heroes/pudge/pudge_hook.mdl");
	game.precacheModel("models/heroes/rattletrap/rattletrap_hookshot.mdl");
	game.precacheModel("models/heroes/rattletrap/rattletrap_rocket.mdl");
	game.precacheModel("models/heroes/vengeful/vengeful_terror_head.mdl");
	dota.loadParticleFile("particles/units/heroes/hero_pudge.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_shredder.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_rattletrap.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_vengeful.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_tiny.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_bloodseeker.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_vengeful.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_kunkka.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_weaver.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_slark.pcf");
}
