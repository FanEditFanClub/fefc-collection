#!/usr/bin/env python3
"""Usage: folderthumbs.py (full Drive-frame crawl, then applies covers) | folderthumbs.py --covers [--force]
For each known folder, find a public non-black thumbnail of a video inside it (searching up to 2 levels) -> data/folderthumbs.json {folderId: targetFileId}. Read-only."""
import re,json,io,html,os,urllib.request,concurrent.futures as cf
from PIL import Image,ImageStat
UA={'User-Agent':'Mozilla/5.0'};D=os.path.join(os.path.dirname(__file__),'..','data')
ROOT='1kGaeK1unqWD1VOl3-DGWLAxISBhDR3cg'
SEED=[ROOT,'1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB','1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS','1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib','1503Wl56hzRppaIFcQisvQksOaeYOEjnk']
E_=re.compile(r'<a href="https://drive\.google\.com/(drive/folders|file/d)/([\w-]+)[^"]*"[^>]*>.*?flip-entry-title">([^<]*)<',re.S)
def get(u):
    try:r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25);return r.geturl(),r.read()
    except Exception:return None,b''
cache={}
def ls(f):
    if f not in cache:cache[f]=[(k=='drive/folders',i,html.unescape(n)) for k,i,n in E_.findall(get(f'https://drive.google.com/embeddedfolderview?id={f}')[1].decode('utf8','replace'))]
    return cache[f]
VID=re.compile(r'\.(mp4|mkv|m4v|mov|avi|webm)$',re.I)
def good(fid):
    u,_=get(f'https://drive.google.com/file/d/{fid}/view');m=re.search(r'/file/d/([\w-]+)',u or '');t=m.group(1) if m else fid
    _,b=get(f'https://drive.google.com/thumbnail?sz=w320&id={t}')
    try:s=ImageStat.Stat(Image.open(io.BytesIO(b)).convert('L'))
    except Exception:return None
    return t if s.mean[0]>=28 and s.stddev[0]>=12 else None
def thumb(folder,depth=0):
    ents=ls(folder);vids=[i for f,i,n in ents if not f and VID.search(n)]
    for i in vids[:4]:
        t=good(i)
        if t:return t
    if depth<1:
        for f,i,n in ents:
            if f:
                t=thumb(i,depth+1)
                if t:return t
    return None

# ---- Curated title covers (official trailer maxresdefault thumbnails), pinned so re-runs keep them ----
# folderId: [YouTube video id, folder name]. Saved to assets/covers/<folderId>.jpg (960x540, q82) and
# written into data/folderthumbs.json as 'assets/covers/<folderId>.jpg' (overrides the Drive-frame pick).
# Folders not listed (editor-named collections, fan-original titles) keep their Drive-frame art.
COVER_PINS={
"11mTK_piAwHaTAePeNA5rRoI3MsgOzD8p": [
"mWEhfF27O0c",
"28 Days / Weeks / Months / Years"
],
"1UAlpXdFkWSVo4mp16cZnjpeIXC3tgK_s": [
"CBcVZcornjI",
"A Nightmare on Elm Street"
],
"15rUF6xKW3dECsvYTB27dHUdHrod09S0w": [
"T3T-evQZiQo",
"Agents of S.H.I.E.L.D."
],
"1ErUTnqrI1Gs-gS2LEYJCl-lgUB6ic6jV": [
"jQ5lPt9edzQ",
"Alien(s)"
],
"1bdPWtnFs0Y636tAAw6i9ESUMX5k2lPto": [
"IN5TD4VRcSM",
"All of Us Are Dead"
],
"17IPhh8eXnHgzfxXZmTBpWgy3h63C11t0": [
"UW8Zyt8SF_U",
"And Not To Yield Series"
],
"1wAG4asuSjNRcRyK1osSUKfizH4mWLv8d": [
"_a3dNB2riKE",
"Arrow"
],
"1WSZBvpZlhwt3CtslHini2QOEq6e-whbP": [
"jLoG-fNir0c",
"Arrow - Season 2 - The End Edition"
],
"1JF6vNBz9QXFHzlGPKQYYWRN6M6WCRF6i": [
"sKr3mjsVZzU",
"Arrow - The Island"
],
"1gC0wp2g7FZ-FeYj91VSofOy9lhYhdHVD": [
"-Yq3jeOmxSk",
"Ash vs Evil Dead"
],
"118OGP6UHLnJaSv4y6nR0kV4bdZ3VvYct": [
"ez6WQ7IX72U",
"Back To The Future"
],
"1JPg2fEIlsRpJU-kc0R6bzIF-Noe-yi68": [
"aG8U7-XK7PI",
"Batman"
],
"1U_u23WQkk8FqqgrQ8-rqXNNTZaKJ6s8R": [
"FAJbR0xad2U",
"Battlestar Galactica"
],
"1LudsjnLU6agYpplhbPvNsOEI3QPTTRwb": [
"rT2Y5jjBNpQ",
"Black Sails"
],
"1Y1JxUF-aEXbJ5JPrSvMbNpztynHo4ihi": [
"ybji16u608U",
"Black Widow"
],
"1gPjy1a9SHu1wCHd9LyGdLB21jeOilh5f": [
"kaU2A7KyOu4",
"Blade"
],
"1sKVzII9W0TVMnb14KqRYMss37W6Uwswz": [
"gCcx85zbxz4",
"Blade Runner"
],
"1I9JOJiVuPXxxvRHwngrieI5FkyZjda8A": [
"VA45Lvm3O4s",
"Blade Runner - Theatrical 35mm Cut - Fan Edit"
],
"1qrivNq7AAj_tMG8CTcMBIJopFwRHJKuT": [
"v71ce1Dqqns",
"Bourne"
],
"1ETD-x5F6eASAX55-L5zznq5jAbRyzJ6c": [
"VaOt6tXyf2Y",
"Breaking Bad"
],
"1tJcr2HFXfKQyiHeU1xDHP2p-KgciOY3R": [
"VFkjBy2b50Q",
"Breaking Bad - A Hank Story"
],
"1bxXHjG7jHios-J4P22-eYS8X0vBC0Lkr": [
"V-daIHTY4NQ",
"Buffy The Vampire Slayer"
],
"13wg0JGoctzUoV6nHY79QOmlA8JsoVBui": [
"gQ7yaQhXJAI",
"Californication"
],
"1W3J4_mTV9Z0J6OH4W3ASUujaHDhpFb0S": [
"tbayiPxkUMM",
"Captain America"
],
"1YyP1cnUNwl-cVpFnYI9mYJ7MrmeaTpJn": [
"s9APLXM9Ei8",
"Chernobyl"
],
"14_qFZmsCuABEqo0XPqJ0_gqHHhY2tyQr": [
"qDbMsaJjp3c",
"Chucky (Child's Play)"
],
"1rO2aS7sVi0BFX61qVeLphreshCGAatw7": [
"OhNwckCLzis",
"Cowboy Bebop"
],
"1jkVF0SVUx9XSGJvx-rOegQRNTkKufuh4": [
"S5hOCtJZAqc",
"Creepshow"
],
"1KZLXYe5aZAtnko5IXtfPV3LwH7__-m1T": [
"jAy6NJ_D5vU",
"Daredevil"
],
"1zZLM_K0v0vYG0g0d1nUDzrGE32g54dex": [
"IwfUnkBfdZ4",
"Dawn of Justice Series"
],
"1eShFLfKzkPiO85DfgGZeJkfoXAOhz49M": [
"5T6U5Fqq7w4",
"DC"
],
"1ZmTTLWr9tty21bX5cU4Wx_cUmcjlfHg2": [
"7UIBOsuUwc4",
"DC Series"
],
"1ukNhvKnqG3zbFVaCM7nScQbx1ppBHKXG": [
"Xithigfg7dA",
"Deadpool"
],
"1puED6mjB_70tfk9tbgjFGkUSnaOvgw7m": [
"t6MXHczeEqc",
"Demon Slayer"
],
"1xfht3f2wVYJRAvcN1fP_U5GPE5s6E2c5": [
"nTOf1FIsBcs",
"Dexter"
],
"1hq-G36fEDT51X18vYEt0thuLEV9QTGDc": [
"0_0K7ZfU2e0",
"Die Hard"
],
"1wouhO_TQ_Q6lG-JGM5ibnGBLx0-MXQ_F": [
"n9xhJrPXop4",
"Dune"
],
"13RgVqu0ANNw3n2V7llfq6xlmJS4AhkQ7": [
"vTGHA33Xyh4",
"Evil Dead"
],
"1Ktg1s35vkuamHLcxAeU4NNyKTb45cgo_": [
"Gtl-6RCOl84",
"Fallout"
],
"1HiudjHpzeBI6n5OvGNNfPulhW-u3KG-h": [
"FUK2kdPsBws",
"Fast & Furious"
],
"1F7AsPLjT_NrsVCOnE6ARrrsZeYaU1DGX": [
"oBZrZij2-g8",
"Firefly"
],
"1_aE37s2YSRGl0WjA-x05pKDKrAkB3cxI": [
"O6uOHnxf85g",
"Flash Gordon"
],
"1cYZymEVHP-0bqPXmWpr71MFp4NVtYLUD": [
"HZS9M52Bd_w",
"For All Mankind"
],
"1HJ73OHxMySs65--JtZuogBBr1E1d8oNj": [
"aDrOvFtzyPQ",
"Friday The 13th"
],
"1H0_7Ic0-GZ9NoOOj3LTniEmyoot1h5Up": [
"bjqEWgDVPe0",
"Game of Thrones"
],
"1I8OLcgGnqypG2exA9pJNhj9uoWJdXQLC": [
"bjqEWgDVPe0",
"Game of Thrones - An Honorable Cut"
],
"10d3nDJo_JrcqPkOlPqBC_YMbAwFefdNi": [
"bjqEWgDVPe0",
"Game of Thrones - Night's Watch"
],
"1x6XNgvRfBBMR_zYhaScAhx3IvEuqA9A5": [
"sItUCKJQLTU",
"Game of Thrones: A Knight of The Seven Kingdoms"
],
"1NCpoO4mP5XQrO7IL-pDcbbzlz9jfvgS7": [
"7nWHZtW-Mso",
"Game of Thrones: A Telltale Games Series"
],
"1jcME2Ds7oGGbkhzMIyfxAYXrcHdtMS-b": [
"GQyO4ghNox0",
"Godzilla (2014) & Godzilla: King of The Monsters - The King of The Titans - d3adconnection Cut - Mashup Fan Edit"
],
"1DThb-URJseJ5Iv1KtcdU7R_wZUddTR7s": [
"wVDtmouV9kM",
"Godzilla Gods and Monsters"
],
"1Ouxy2bzfVzoI6DVmrJ99rRrHz9LZhdkh": [
"lV1OOlGwExM",
"Godzilla Kong - Brave New World"
],
"1YxDF1mW6sgwaGaPWWl9v5lJ0lUoXcTyV": [
"odM92ap8_c0",
"Godzilla vs Kong Survival of The Fittest"
],
"1kZiEf6rCqTz8n0LjidDFW7CM76_7EkKa": [
"7-GO9fo9DtM",
"Green Lantern"
],
"1VXNtFiFBpgFD2BG3zO9YQ6VBAYuvxTE2": [
"gd20j2Hb-0Y",
"Gremlins"
],
"1N9MKeruSqMVEglW0tJwdXKstgfP1jK36": [
"ek1ePFp-nBI",
"Halloween"
],
"19_hB-nYF1B4SUKrU-60p9nNLbpzaPHeV": [
"3JsrH8eUVOo",
"Halloween (1978) - 35mm Scan - Fan Edit"
],
"1M_URqym-QUdGmX4xK0o26sE2mCSJASff": [
"75CFtwn1CEU",
"Halloween (2007) - Workprint Cut - Fan Edit"
],
"1fVg-OeUuaBLiSz7meqiff_jhbN4rwZvN": [
"RIu4sFKGi6E",
"Harry Potter"
],
"1lYUbtFW4GbL8qhdn2507BueF3nyJMVd4": [
"5VYb3B1ETlk",
"Hawkeye"
],
"1YqiwFgLB6pp69cSWY3bavO55omDZrlqv": [
"5tGgqyhCIXQ",
"Highlander"
],
"1IAKou2kGGcQr9lAf_9nKTqMvmTO38KPE": [
"xbqNb2PFKKA",
"Hulk"
],
"1_1nV4MSnyPICHIsb2jswOSLkkkevAvUa": [
"0xQSIdSRlAk",
"Indiana Jones"
],
"1Q247Wyg1dIwgknXnsN2esA6ROUywJd5u": [
"jxU8FU3o75A",
"Insidious"
],
"1WaZDoZbtziAFWGoCGPGn_fmm8ka0hA8s": [
"f9OKL5no-S0",
"Iron Fist"
],
"1svXZQjf2I-GiHRsZkISDxM-mC5hWQcyX": [
"Ke1Y3P9D0Bc",
"Iron Man"
],
"1kKws1zweuNNV5TTHwh8m9lTxAyL1GtQF": [
"xKJmEC5ieOk",
"It"
],
"11X9Ra52Y2Wgn88Cd70_Ph3OinE02WarD": [
"oKa6u7LT0qE",
"It: Welcome to Derry - Derry Cut"
],
"1DEWGPeFVQYiB-Yj6wYwAWv_jZ4j0fPAQ": [
"36mnx8dBbGE",
"James Bond"
],
"1qVa3QLm5fVflWiRXn6yvzkiVmV-dqG2K": [
"U1fu_sA7XhE",
"Jaws"
],
"131PJ19BQ71Ho5CFiWpHo8_H9Hll7Npqt": [
"opiCMIN3PNg",
"Jaws: The Revenge (1987) - BBC TV Cut - Fan Edit"
],
"1dFF80_P5FAtXPR7bYxJQi57f8W4zBU7b": [
"nWHUjuJ8zxE",
"Jessica Jones"
],
"1hTQP2fz64xKYPfMT8GLDBr4bDGk8CU6B": [
"QWBKEmWWL38",
"Jurassic Park"
],
"1xYb-yMcgXSTY7f2_ODvXyb6W9zF2aQdq": [
"VIUnvSguF0Q",
"Jurassic Park: The Game"
],
"1BVggYPbdjeBsX6nyCZP9SQIX_znYZfYL": [
"EcnAb--yEcg",
"Key and Peele"
],
"1SA44G96agST5h8wiw7puPgC9dkZwGK7t": [
"qbUz68h9BFo",
"Kill Bill"
],
"1S1PafxVpluPaBNfDtH5n-4cVfIbDVkp7": [
"aaKCpYzNQqY",
"L.A. Noire Series"
],
"1PecZpWiqNvy71-HZYUqvenHuGl0VThWU": [
"7zxh49-bsIk",
"Landman"
],
"1460CdBpuayO9kSMp3KvJtfVjxw5ugElG": [
"bKeW-MGu-qQ",
"Lethal Weapon"
],
"1sY2LygbA8f3ZcAUNq3Ya5vgRknOSjz3q": [
"UPZ7OELAwIo",
"Lost"
],
"1vVltsB2XULldPBViJ0lzvvPmOxfmzEvF": [
"UPZ7OELAwIo",
"Lost - Chronologically LOST"
],
"12csh8dwKU3qSwL0_FgI_JD3MeArWdGcX": [
"RMey_3fEJp8",
"Lost - In The Detail"
],
"1o0AOf7gbOCqIOqILMzLbkVvLNamFxKNy": [
"wUFwunMKa4E",
"Love, Death & Robots"
],
"1CVwGSoj9SG-HmP3ZLmRJTcwmjz7Zd-LA": [
"ORa4hPhGrpo",
"Luke Cage"
],
"1uxGLb58ZcmzUoyWTmvit5JFT-eooKkBD": [
"hEJnMQG9ev8",
"Mad Max"
],
"1Y4aJiq4ONR2qScEjyquMbzO4uC9oP3C2": [
"sXKnmgmbkoE",
"Marvel"
],
"1hXtNwD1D-OmQxXIEnOFDSWhPRdypzCMd": [
"-G9BqkgZXRA",
"Naruto"
],
"1HNITwajPadGoFRDMgJ_NCM-BbCZl0WRz": [
"13nSISwxrY4",
"Neon Genesis Evangelion"
],
"1nl8r9OwsByvdHTiWsA2T4Y1JwcGCh9vj": [
"38A__WT3-o0",
"No Country for Old Men"
],
"19xYtBpwF_qnL_vTUuepo74WX6DxYnINr": [
"MFWF9dU5Zc0",
"Ocean's"
],
"1_-URWh2uJsyaAE7i6AIWgpe7wsQuZCjB": [
"4GGoDIBvzWM",
"Paranormal Activity"
],
"18py1chaPLhHa-8M3PoqXxu4Y6D6qSoeZ": [
"maIGHqJB6aQ",
"Parasyte: The Grey"
],
"1UFrXE4XTmK0xIpc2OooMF2HlWXB4a2De": [
"1oER-kg7ffU",
"Parks and Recreation"
],
"1oT295znV21AleYbfeRx6Oz9pzQaRBd0z": [
"naQr0uTrH_s",
"Pirates of The Caribbean"
],
"1zdwAQkMjhNXwGhRFLXqhwv_m0Sgp70FG": [
"ZKE2DC7Xzog",
"Power Rangers"
],
"12XlOlKk8yQvwtXVODWAh_xOETZ6VPEAR": [
"vq3JeRfju3I",
"Preacher"
],
"1yQvTgfl9HYA-85gzqkIDIxSboRM_7Yqt": [
"WaG1KZqrLvM",
"Predator"
],
"1CdFK49UyHMHW2bEWjbdNRIDkvJ24TmsY": [
"p0QkvHCfg7w",
"Psycho"
],
"1dKWNa896ZXBmTBTJAf5OfnaOR-tVYirt": [
"s7EdQ4FqbhY",
"Pulp Fiction"
],
"13hoPs9sBtSbSpU2fwPL4Zi3Sp_QLKK5t": [
"2CRjdwRYQbU",
"Rambo"
],
"1cYa7mX03M2P432Ick--9qAk2L9eTaAvM": [
"5eCMmHa3NYM",
"Revenge"
],
"1IWb5XYTikkZlhNzSWXIL3mM_vaYzp3Gv": [
"hl1U0bxTHbY",
"Rick & Morty"
],
"1sDaruqyPmafHhI7LiPWoxPqeIpp8wXNH": [
"IqvRDhW-XVA",
"RoboCop"
],
"1H_yQ-y0wg3aAmRXWq8esvBSLLrJnyKQJ": [
"V_g_Ut0jO-0",
"Rocky"
],
"1n_qjXWwJ05Ezz69Y5k9Lh96qPsG5jFqq": [
"JMiFsFQcFLE",
"Rush Hour"
],
"1cRj2zulYwsLHgbMlRt0Iypogf9opQAcB": [
"hQXKyIG_NS4",
"Seinfeld"
],
"1Kp9is8f23_vqMo4yYWMBkp6Tze4q-Id_": [
"hQXKyIG_NS4",
"Seinfeld Extended"
],
"1MkQPRWwNrMq3jdM09a0SJAT9iLqQLIMu": [
"xEQP4VVuyrY",
"Severance"
],
"1YBCqlfvyVPDvge-QV9X5k0AevR8boUFl": [
"J7nJksXDBWc",
"Sherlock Holmes"
],
"10Tobpc-1IOfmI-OysRC9aWJeM3IZjYWK": [
"IJMi4j86W2U",
"Smallville"
],
"1lber90JXMaac17OXWdMBOA62sJP-LflL": [
"1Rs-XdFtNg0",
"South Park"
],
"1oAxtIZfCgwg1PK1-yahhnNPmXjbdJgl4": [
"bdpYpulGCKc",
"Space Force"
],
"1m-k9HaxdjpN6eqGiuWGvpI3FsqWhfwH3": [
"1eONa8Nx_jQ",
"Spider-Man"
],
"1rfNRi5OpYmisrWdniYNCpIA9ZSynt9Cl": [
"85nfSzEho68",
"Star Trek"
],
"1EawyIt_A5UtV6AoilFD8M09ayzdWt3RZ": [
"70dm3WzNuss",
"Star Trek: Discovery"
],
"1CVIcE2m4dgmLQ8W5oCRyWZTXjgc7LOn4": [
"FySrgrKJguE",
"Star Trek: Picard"
],
"1jZI-8uF_Zd6WsuBtl_YfNXlBbu48PjHS": [
"zrXvBaFFu80",
"Star Trek: TOS"
],
"1vl9fARDzWbBgI658ZIqTzgQsibZd_ggc": [
"N9gZhlvhzEs",
"Star vs. The Forces of Evil"
],
"1RV29lGvh3kqrBoUA5sQBe5LHceB7XoiF": [
"sGbxmsDFVnE",
"Star Wars"
],
"1LIPlim9yH2Oaeig-vu3sF86xlUo_9N_m": [
"QHAu5XHsDhQ",
"Star Wars - Andor"
],
"1CAM87va1wgP_AOsVUVFWZDV3jnrTeUBg": [
"3Yh_6_zItPU",
"Star Wars - Obi-Wan Kenobi"
],
"1pskeBfitA6f6O1u3-Pj_IDY5kxMZPLQE": [
"8Qn_spdM5Zg",
"Star Wars - The Last Skywalker Series"
],
"1uScnRSB3sRqBfCedH1mFe-_zX8kkRWr0": [
"Fj46vOVwiDs",
"Star Wars - The MEGA Extended Cut"
],
"1TmOdSLFZOzvD0eCyfrPRUC5kuDDrdEDP": [
"c3t2f7KpL4Y",
"Star Wars: The Clone Wars (2003 & 2008)"
],
"1GvC8BjQ8ob-smZNr-QQv3CJ4FGByURNx": [
"b9EkMc79ZSU",
"Stranger Things"
],
"17MVdy6grBMj3NkbO4UpcovzbEpooB-zZ": [
"Ox8ZLF6cGM0",
"Superman"
],
"1hwV8omrh-q_9zVpS8bqqN5L91nxy44c7": [
"eL3ulBENltc",
"Supernatural"
],
"16aLdl_xjdITGYXeRrQXaSB2yz8NESCjx": [
"VZZ0PnDZdZk",
"Teenage Mutant Ninja Turtles"
],
"1Hsdc8xMQNsI8oF8vD12y_JeijUgICK9K": [
"nGrW-OR2uDk",
"Terminator"
],
"1wgjrSmVkeMfi6yxLAbRphslQK2a5Zg0h": [
"ShJvheZHXdI",
"Tetsuo"
],
"1jR3645MRiGEh3bQh8lh7xweuGiK5jpfw": [
"iIEYfH-jg1Y",
"The Exorcist"
],
"1oU_KrdGAeA_SnIjNuBiGN2tnkFCc2wKw": [
"41wwUOvjNos",
"The Exorcist - The Reconsecrated Cut"
],
"1tExaXYuAGuoIx9Nbkownl1uVaHEkOtNi": [
"hebWYacbdvc",
"The Flash"
],
"1k6g_pPyjcFGATmMVHc_sczHxMHS72M6I": [
"UaVTIH8mujA",
"The Godfather"
],
"1InBo61eL0jfwVz3hfl57_L_SNpaQA55q": [
"mfmrPu43DF8",
"The Hunger Games"
],
"1Yf5NcpFuiOQvVr0q3K7JL46dTKQU8FYU": [
"uLtkt8BonwM",
"The Last of Us"
],
"1ep8voZyGvwYTrL6RKRnvStZ1J4N-qgPY": [
"V75dMMIW2B4",
"The Lord of The Rings"
],
"1A51S5xpoJIcv_blua7M7e308c4xMnFlT": [
"2u_pZR6iYjw",
"The Lord of The Rings - The 13-Part Trilogy Series"
],
"1JebShtRAyxBcCzi4bUTlfmk7JrIujjDN": [
"r5X-hFf6Bwo",
"The Lord of The Rings - The Book Series"
],
"1Cvd74Hq44gNHXAyXeZrjrQHdT4IKETiu": [
"r5X-hFf6Bwo",
"The Lord of The Rings - The Reinvented Series"
],
"1f61yaGwkNj7URPjYe6LcvAbIrvg55RnB": [
"zzayf9GpXCI",
"The Man in The High Castle"
],
"17xiPoSxDlZOr4PYmWoeLvZ0bWbVuN5m-": [
"9ix7TUGVYIo",
"The Matrix"
],
"1ZgZ0GQAFkH2ME1icLTUtI6Y5R7e2lUzY": [
"XBQclv1ofaw",
"The Monsterverse"
],
"13btNhUyaio2WsxWvB1Jc7xjwcMLjuABP": [
"uLguU7WLreA",
"The Naked Gun"
],
"13rM1dXsXMImbgSu2zq1ePfzi9Yk491bf": [
"MIEVoulYZM0",
"The Office"
],
"1uDt1ziVW6-YLUcvpM47X665GH5JD4yli": [
"cYRL93Ayp_g",
"The Orville"
],
"1bUoDRYrk342eDUq7PN1AN7TSklUFhpZk": [
"XtFI7SNtVpY",
"The Planet of The Apes"
],
"1gLgY8O4hL9bg3sal_nS2COvFJFULsW8t": [
"jrLhP5sK2wI",
"The Punisher"
],
"1_qXYZYTgqgZAx1yb7UxuihK-Sn-9M4B9": [
"KeSAFGWzft8",
"The Return of The Living Dead"
],
"1F1KYlPyWbyjnn_2_Q_S-nJVeEiIaVGS_": [
"2X4UhSPA5d4",
"The Sopranos"
],
"1A5LBy32Fl8zz_jSqXklZSMMNrUXxQLUc": [
"eg5ciqQzmK0",
"The Suicide Squad"
],
"1LETRRXE-N5a75MS61dQCqk5L8HxUsS9h": [
"JIdw2B6zipc",
"The Thing"
],
"1GBpKbZQZJjaZLbLFkFl4t-UcosDxKnMy": [
"29_gA_GDGvE",
"The Twilight Zone"
],
"1razHT8yM6dPfMHJ7vWDjhYfuUbP-DUwP": [
"cctvSNDaaYs",
"The Walking Dead"
],
"1BHrbYZWmwSPfKbHEpC-hN-06mOATMzA1": [
"VBzZ1L0p9JQ",
"The Walking Dead - Amputated Edition - WalkerBate Cut - Fan Edit"
],
"1pnjFDQw2oRHFa95q6RpqQGSGevUX8E0h": [
"dk2enZdNLog",
"The Walking Dead - Chronological Universe"
],
"1OBe2y6Ic36Enz01WKa9E1c8cRWXbkmNn": [
"cSqi-8kAMmM",
"The Witcher"
],
"15TX3OKwukquWvf7CEGVFa5ZfIQjm9vc2": [
"b_D3ysY_QCA",
"The X-Files"
],
"1NCPFbafc9adocTuVkiwQyG6y2TPFxEwx": [
"ue80QwXMRHg",
"Thor"
],
"1wY9t-JoF-Q91IyHYH8yyNZjO2cKh2fYF": [
"P78pl1FUXfA",
"Tron"
],
"1XVjZpxI832lvQ18JOZE7PC6T3_69AetH": [
"QbHX0RduWkY",
"Twilight Zone: The Movie"
],
"1AhJbpTLh48U8IO53n77PkrXRZznaPlit": [
"rFuKtJjhBCQ",
"Twin Peaks"
],
"1exX9K-gpzUJm2p3lX5q8tkAxGdlD881M": [
"5QNZ44zKzjo",
"Twisted Metal"
],
"1E2C2fibWCpukofZ9JAJba5wZefelj_oz": [
"jkE_ZaASoPQ",
"Universal Monsters"
],
"1RPvTm5hzZJJd3XYLchJ4xgMSRThWbthl": [
"lUhiNXKrAiM",
"V/H/S"
],
"132jLMbuVreMIog4edGVn48dRci4cVDew": [
"u9Mv98Gr5pY",
"Venom"
],
"1OV2EjfA17__o1Dg8T4f6Qkpq2mzSme4F": [
"Yi4YnwFT7Gk",
"Vikings"
],
"1kqkGTnoOlnst6DBwnBz1phPK2hvTz5X5": [
"IuS5huqOND4",
"Westworld"
],
"14XsbwXovZ00-QJp96zONs5yoH1Csj9vt": [
"qvV-Phz7eMg",
"Whose Line Is It Anyway?"
],
"1fdQEPQotiPn6XfE3SmIIBJzuhW9TA2Il": [
"xgc69U7cBJs",
"Wipeout"
],
"1z6QYErdlw6r8cCRQUhcBgeAbsmkguFx9": [
"IOYG7xqQb9g",
"World War ll Supercut Series"
],
"1u6Qqt4LGi07EMOiqpJtCJ7TYQQyNHI4j": [
"PfBVIHgQbYk",
"X-Men"
],
"12Ad2LfFK9Xtmg5j7W1eIdbKgCLsF1jet": [
"jr32f0rnK1o",
"Yellowstone"
],
"1hUTfBMGtvh8n9h3eSIOQBUzLMlzfQnkR": [
"jr32f0rnK1o",
"Yellowstone - Season 1 - Fan Edit"
],
"1yUKjTxRG7LQ84F_Mr2q7tpMg3aIA1nOO": [
"vIu85WQTPRc",
"Godzilla  (Japan) - The Sensical Cuts"
],
"1tPLzI1S9cV69qdhvFA9qzld4WNe9X89X": [
"Q3EASLgzOcM",
"Hollywood - The Sensical Cuts"
],
"1xubVBwzg113U866eZLhrAR1o_Jv-lEbA": [
"nTOf1FIsBcs",
"Dexter"
],
"1-ElARRrrbG2K0IcHJvvErCkjU-y6Bwpw": [
"sXKnmgmbkoE",
"Marvel"
],
"1CT-3hyqSDLp33AcP3IM0myYt6mafxLpm": [
"XtFI7SNtVpY",
"Planet of the apes"
],
"1EC7sKStwcUSROsQEL9C1NGxK3a4mpVfx": [
"x8UAUAuKNcU",
"Rings of power"
],
"13EXMjh2IT68CZ6ji2vl2Hudeb8-R9QKW": [
"5wLCNEyz0-E",
"Solar Opposites and Rick and Morty"
],
"1p6lUL9qSOsJw-Na7o1Nyic4xqeRAkrNG": [
"tsD0CNTDKQA",
"South Park "
],
"10n7of2kwlefFkn9Ny2zOCywgDUtua7lb": [
"sGbxmsDFVnE",
"Star Wars"
],
"1PMFzTdn1BZZzgeNHXaCWdyz0a7QZuZ6_": [
"sGbxmsDFVnE",
"Star Wars Crawl"
],
"1ubB2ogXu7MdfM35n8JjYj_CWwq7JKIGg": [
"cnf4h5HT4dc",
"Lord Of The Rings: The Trilogy 13-Part Series"
],
"1GFaMD67zid0soscK924SiUlAuku1Bhn-": [
"CBcVZcornjI",
"A Nightmare on Elm Street - The Baliscon Cuts"
],
"1ayPbduMJplJjgIWXkLxN9q9qqBrBFkKJ": [
"ZbsiKjVAV28",
"Alien Series"
],
"1cxH01iCkqccOGYHnJ2Yee9NYH6BPQuMC": [
"-Yq3jeOmxSk",
"Ash vs Evil Dead"
],
"1qOV2zM-fgsTd43-co9OPqNlaU4qkDDsP": [
"0HjdiohVOik",
"Backrooms"
],
"18dQ5-zypr8oyqm1dNTCqtlT0D5E6AmB_": [
"aG8U7-XK7PI",
"Batman Noir"
],
"1C5Zyp1-k0Jg_LeIpxhcVj5kYcs2TlST5": [
"aDrOvFtzyPQ",
"Friday the 13th"
],
"1rjdvUshNzw7CssqqR48OyezlZ_2PAGsT": [
"odM92ap8_c0",
"Godzilla and Kong"
],
"1db3auHFg0q-eL04lRUSY4AiNzxv6vura": [
"ek1ePFp-nBI",
"Halloween"
],
"1HQ4cGRB1k3mSHDOMoKrXRm2lz9Ttxefg": [
"UyPWpP6w8AA",
"Highlander Series"
],
"1w2tmHabMwQsMXLxSaqHQH_q90OlgpfPq": [
"jxU8FU3o75A",
"Insidious"
],
"1cal67UuSdLCcSTaVjJhbRd7swAeOvZjm": [
"xKJmEC5ieOk",
"IT"
],
"1H6RGkemEWenhjEGnb5yClrJQb52OYjx-": [
"qbUz68h9BFo",
"Kill Bill"
],
"1Se9u8fANVswJGZTIjpr-E9RuWlgjC18-": [
"13nSISwxrY4",
"Neon Genesis Evangelion"
],
"1OABLj7eFx2o8uy9FQZbFTxWQujMgrlbN": [
"ZKE2DC7Xzog",
"Power Rangers"
],
"1zLke6v5I8K2ppbWO1sqv7YPZYTA1AGAa": [
"IqvRDhW-XVA",
"Robocop Series"
],
"1tqIWCdEsiulBSVBl7cdkzo0UX28BDFHJ": [
"sGbxmsDFVnE",
"Star Wars"
],
"10DXfB-j0M9MVbT3slaNXaVW9PHIwRUHh": [
"Ox8ZLF6cGM0",
"Superman"
],
"1ihPytLBPdurOz_YOYjaDacGSAUcSoHbf": [
"ShJvheZHXdI",
"Tetsuo"
],
"1jCd6my-X1Rd8B6yIhYGQjq7-LcLQ1eac": [
"41wwUOvjNos",
"The Exorcist Series - The Reconsecrated Cuts"
],
"10MSDIl69QZTAwO6RR6Yl7u7Bdpbh_tW_": [
"JTSoD4BBCJc",
"The Hobbit"
],
"1fOkji4glltvts8yERGGNgVYwAT5QJGe6": [
"rFuKtJjhBCQ",
"Twin Peaks"
],
"1rSJiRmTw0Dt5bCzjvc65pd7S2A6EMLGb": [
"8ClVrVK_y0E",
"30 Days of Night (2007) Darkness Falls Edition 1080p"
],
"1fiCF1sbKTArhBI17aUGfSK8j-fCcn_4a": [
"-SzkFgEqB6Y",
"Kill Bill - The Complete Bloody Affair (2160p)"
],
"10VT7YMfwcJviGN4tc25cJJ0hSeIQpSrt": [
"7Bbh9CUFS0M",
"Mad Max - Oil & Chrome Collection 2160p"
],
"1T9sHBahjpAjSx80klEZoY0BsMfaPukDc": [
"l2h2lC0vlX4",
"Sinners - Black & White Edition 2160p"
],
"18ESYAHn-CUn7vO2_ZvXwXtrmJGxMXWe3": [
"N5uPZ7ocsqA",
"The Crow (1994) The Brandon Lee Project (2160p 60fps)"
],
"1oB4Kpu8S3jMyLzrCUchHqcTGgWmtiZMS": [
"36mnx8dBbGE",
"Casino Royale Extended Cut"
],
"1MnmQAmRz47Wq9Wp5UwLZktpYK-z0uahX": [
"Wt6-3Sim6Gs",
"Game of Death Story Edition"
],
"1-KIZrb6ZOvvDVuixuoq7wF3n2WmLn-YY": [
"w16bYZ-4nmE",
"JFK Extended Cut"
],
"1A-NK_Nvjfgd_jfPE37I6b_wE8Yew7DqX": [
"moNH4N44D28",
"Kingdom of Heaven Extended Cut"
],
"1rzzy7LlxqVjgkP91hDFqaO_A7xtc-HtQ": [
"znmZoVkCjpI",
"SE7EN Extended Cut"
],
"1oDU7n6nxlv5GVqPAMsXTTbFEiKbjsOoR": [
"LZl69yk5lEY",
"The Mask Extended Cut"
],
"1VKaBqloc4hVlhHcCnO-fq87IPvafJJOV": [
"abwtRFZx8Rs",
"The Mask of Zorro Extended Cut"
],
"1eBriCU-jd4dAif2w_MueibpId-bWqkfY": [
"V75dMMIW2B4",
"Lord Of The Rings Stuff"
],
"1HcKTFg3OGyDl7l9QgIydT0dI-ZkuiIXO": [
"s73x_Hio_0w",
"Toy Story 3 - Especially Español"
],
"1T3HOdRqI7kL9785tCfxJ0zPsqWNsjt6c": [
"kA2WzBi2grE",
"Independence Day - No Family Edition (2015)"
],
"1y9jMB2ve3rSlQ-zklXnuNwd-nQSdzkxS": [
"XpLKNclOtLg",
"Natural Born Killers - The Tarantino Cut (2015)"
],
"1LpC4CdRUQQAeYge4oSTY7XzwubaaKjZ5": [
"-Yq3jeOmxSk",
"Ash vs The Evil Dead"
],
"1tCTW3gDatGQzjaaeZ66zKG4jLn-ThL-r": [
"T6DJcgm3wNY",
"DC Origins (Old)"
],
"1Pm38nRB_VdThNe0idD_JT5MqtbTDyBpD": [
"Ox8ZLF6cGM0",
"DCU Cuts"
],
"1OXm1Ybo9jwZ2Mzjiwci0IIa3lNCqlD9Q": [
"7-GO9fo9DtM",
"Green Lantern: Fear of Paralax"
],
"1ynILbcPGEDYALQJePhS9WaCrdUEZZukY": [
"RIu4sFKGi6E",
"Harry Potter The Series"
],
"1HNGobQtBAa1Mv0J1htFktFODoPNMvCMZ": [
"-ncFDuKdgNE",
"Popeye: De-Musicfied"
],
"1_3P-dD7a3i2MEA1pxv9ZEfLyZ-ZNzLp5": [
"2GDA4E_9CyU",
"Scooby-Doo Zoinks Cut"
],
"1g4lX3EbuNKs9vmXLWIg9xuNG3zGS5HoI": [
"sGbxmsDFVnE",
"Star Wars Edits"
],
"1tyRF_xuvSRh73jCsXA5eM_9MOznPHXNV": [
"2WKPKnggJqk",
"Tim Burton's Willy Wonka and The Chocolate Factory"
],
"11UXTTCBXFgZETX3YBq0pkgnzxFZxygpF": [
"eBopZGiBI-I",
"Marvel Knights Series"
],
"1YYmNYR6zJLC4jn964KOF4sUDrzyyicrF": [
"qZo7A_XBNeE",
"Teenage Mutant Ninja Turtles: The Series"
],
"19Oy65CvFghVRspATLQQOjs3TM1TTb5xX": [
"b5VGhWJlG5M",
"Joe Dante Films"
],
"1CA63V8iame8r4he6NPiyZzT53q5psLR_": [
"KeSAFGWzft8",
"Return of the Living Dead"
],
"1r1b7gs9RVBLPzXHZFxRi5PLtZvoznJtR": [
"TnHby2cxJzs",
"The Evil Dead Trilogy"
],
"1absJapV3GAEwdVm9PbwnCX-aMt9u_X3P": [
"uLguU7WLreA",
"The Naked Gun Trilogy"
],
"18MvbdhTY1ITsS5W23Ty96IHk5vvh19kk": [
"-6BrTJnGMjc",
"The Three Flavours Cornetto Trilogy"
],
"1w0JA5U7W6V6nhAHE7o_ygshH3oigmWdz": [
"SH2f4A4SVNk",
"Christine (1983) - Joy Ride from Hell Edition - Vasglorious Cut - Fan Edit"
],
"1e0YHLUMwGgXlqGOF-T1_OJbrHw8UvgWw": [
"LDh0YZz9ZrU",
"Batman: Hush - The Silent Cut"
],
"1RNlTu9_Ckq_lbVkVbghem4Awh95J67X2": [
"8qodAY3S7Dg",
"Batman: The Long Halloween - The Godfather Comic Cut"
],
"1nYTJfa1Y4TP6U3YkB91U02rDVkZAfDlq": [
"qlCFzjRzTN8",
"Batman: Under the Red Hood (Womp Rat Edit)"
],
"1zFoCqjM5Z52H2qlA_DimSMOKSOHt5dVe": [
"LGM5rq_vX4U",
"Calvary - Womp Rat Edit"
],
"1QWtyc97w07ZVavgdQY0WDfzxJDPixlXB": [
"3E5Kf8PFLyE",
"Father Brown"
],
"1Hyt4zYzKHuIjy2woVOlyFzmSe0KJhsCC": [
"DHREzAdyCPs",
"Father Stu - Womp Rat Edit"
],
"1Y94jOqJf6ALO6-ywf9mwhb0_xETWZQwu": [
"4kIavuY5NXw",
"Galaxy Quest - Womp Rat Cut"
],
"1QHmpXtmORB1vcOaui_bRxjcvQ8SNrz79": [
"DotnJ7tTA34",
"House of Dragon - Censored (Womp Rat Edits)"
],
"1i0i-TEYUv_yAhEA-Z4QAD7enfqtBKC1L": [
"moNH4N44D28",
"Kingdom of Heaven Womp Rat Cut"
],
"1wMTpVH7a5YxaJrzfkwV3p4_QLeoCI9Fv": [
"Y9HlnFOYrdM",
"Lawrence of Arabia - Womp Rat Extended"
],
"1hvNpGDfQ4m7DKlyQ8BMNl7YgqpVA20Jr": [
"hEJnMQG9ev8",
"Mad Max - Womp Rat Saga"
],
"18vTiK5zePyrgpUr6UUIZlMC3CxV6DnBz": [
"o7v616__Ays",
"Mass Effect Paragon Lost - Womp Rat Edit"
],
"1jPZKidDmk2C8DWGByGDaXveKyMvq-Xnx": [
"rPJUXZvX6UI",
"Office Space - Womp Rat Extended"
],
"1GpbrAsqHeuxyU434AVPgDakae2UgVG0x": [
"Kx55Rkynhtk",
"The Menu (2022) Extended Cut"
],
"17ERTIn5UegbRMvKvZK2gZoophNoHBy21": [
"11ZozKfRqvA",
"Wheel of Time - Womp Rat Edit"
],
"107vdjeWEeA1II-RPwN3mjl6pvDigCdT1": [
"0bVvTMa_IHI",
"Battlestar Galactica Extended Episodes"
],
"1boZXizu6iHn4OZRoq7RiIaHQSZgiBHJI": [
"EOOYGcPlDGI",
"DC Animated Universe DCAU - Womp Rat Edit v2.0"
],
"1UEZwEu9khGAo-UCUEJcrX_5bXaMOMXCy": [
"t6MXHczeEqc",
"Demon Slayer (Womp Rat Movie Edits)"
],
"1uWHxNysa1syEW71feFr-dDJs7uLpqJaZ": [
"_eorHMTONz0",
"Naruto (Ocean Cut) - Womp Rat Remix"
],
"1PBSsCgG_uztgJ90ynjfugrHsIwlnk0-3": [
"sGbxmsDFVnE",
"Star Wars Womp Rat Edits"
],
"1UpmLf94FGNCdAvv_bjOf3rh1ftDZ_KJy": [
"7UIBOsuUwc4",
"Lanterns"
]
}
# Manual still overrides (win over COVER_PINS on re-runs). James Bond: Dr. No (1962) gun barrel, en.wikipedia File:Dr_No_trailer.jpg
COVER_MANUAL={"1DEWGPeFVQYiB-Yj6wYwAWv_jZ4j0fPAQ":"assets/covers/james-bond-gunbarrel.webp"}
def covers(force=False):
    os.makedirs(os.path.join(D,'..','assets','covers'),exist_ok=True)
    out=json.load(open(os.path.join(D,'folderthumbs.json')))
    for fid,(vid,name) in COVER_PINS.items():
        p=os.path.join(D,'..','assets','covers',fid+'.jpg')
        if force or not os.path.exists(p):
            _,b=get(f'https://i.ytimg.com/vi/{vid}/maxresdefault.jpg')
            try: im=Image.open(io.BytesIO(b)).convert('RGB')
            except Exception: print('cover failed',name); continue
            w,h=im.size;ch=min(h,int(w*9/16));cw=int(ch*16/9);im=im.crop(((w-cw)//2,(h-ch)//2,(w-cw)//2+cw,(h-ch)//2+ch)).resize((960,540),Image.LANCZOS)
            im.save(p,quality=82,optimize=True)
        out[fid]='assets/covers/'+fid+'.jpg'
    out.update(COVER_MANUAL)
    json.dump(out,open(os.path.join(D,'folderthumbs.json'),'w'));print('covers',len(COVER_PINS))

import sys
if __name__=='__main__' and '--covers' in sys.argv:
    covers('--force' in sys.argv);sys.exit()
folders={}
for s in SEED:
    for f,i,n in ls(s):
        if f:folders[i]=n
folders.update({s:'seed' for s in SEED})
out={}
with cf.ThreadPoolExecutor(8) as ex:
    for n,(fid,t) in enumerate(zip(folders,ex.map(thumb,list(folders)))):
        if t:out[fid]=t
        if n%10==0:
            json.dump(out,open(os.path.join(D,'folderthumbs.json'),'w'));print('progress',n,'/',len(folders),'thumbs',len(out),flush=True)
json.dump(out,open(os.path.join(D,'folderthumbs.json'),'w'))
print('DONE',len(out),'of',len(folders))
covers()
