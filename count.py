import pandas as pd
import re
from collections import Counter
import os

# --- 데이터 및 설정 --- #

# PLAYERS_META 데이터
PLAYERS_META = [
    {"id": "Tana", "이름": "이대연", "팀": 1, "종족": "Z", "티어": "갓"}, {"id": "Sword", "이름": "김연섭", "팀": 1, "종족": "T", "티어": "갓"}, {"id": "Cain", "이름": "김태훈", "팀": 1, "종족": "P", "티어": "갓"}, {"id": "WoongD", "이름": "구선웅", "팀": 1, "종족": "T", "티어": "휴"}, {"id": "HKK", "이름": "전성민", "팀": 1, "종족": "Z", "티어": "휴"}, {"id": "MiMiMong", "이름": "이창언", "팀": 1, "종족": "Z", "티어": "휴"}, {"id": "KuSan", "이름": "강구산", "팀": 1, "종족": "Z", "티어": "애"}, {"id": "ziLLeKi", "이름": "최성진", "팀": 1, "종족": "P", "티어": "애"}, {"id": "Nucleus", "이름": "김기현", "팀": 1, "종족": "T", "티어": "애"}, {"id": "jjabTana", "이름": "김현기", "팀": 1, "종족": "Z", "티어": "애"}, {"id": "HD", "이름": "조항용", "팀": 1, "종족": "P", "티어": "애"}, {"id": "Toast", "이름": "설재근", "팀": 1, "종족": "P", "티어": "아"}, {"id": "Kensay", "이름": "이경성", "팀": 1, "종족": "Z", "티어": "아"},
    {"id": "Hillock", "이름": "강응선", "팀": 2, "종족": "P", "티어": "갓"}, {"id": "sEpI", "이름": "김경식", "팀": 2, "종족": "T", "티어": "갓"}, {"id": "Jenny", "이름": "박진욱", "팀": 2, "종족": "Z", "티어": "휴"}, {"id": "rOdeO", "이름": "김재현", "팀": 2, "종족": "Z", "티어": "휴"}, {"id": "beat", "이름": "이동규", "팀": 2, "종족": "Z", "티어": "휴"}, {"id": "KJJ", "이름": "경제진", "팀": 2, "종족": "T", "티어": "휴"}, {"id": "Twin", "이름": "유윤실", "팀": 2, "종족": "P", "티어": "애"}, {"id": "Asada", "이름": "공동현", "팀": 2, "종족": "Z", "티어": "애"}, {"id": "StyLe", "이름": "한규호", "팀": 2, "종족": "P", "티어": "애"}, {"id": "ZirubAk", "이름": "방호석", "팀": 2, "종족": "Z", "티어": "애"}, {"id": "SandbaG", "이름": "염규상", "팀": 2, "종족": "P", "티어": "애"}, {"id": "Tori", "이름": "양시찬", "팀": 2, "종족": "P", "티어": "아"}, {"id": "zoa", "이름": "서승일", "팀": 2, "종족": "Z", "티어": "아"},
    {"id": "MansaeGii", "이름": "문명훈", "팀": 3, "종족": "P", "티어": "갓"}, {"id": "Nolg", "이름": "채원식", "팀": 3, "종족": "Z", "티어": "갓"}, {"id": "Pooooker", "이름": "전은후", "팀": 3, "종족": "P", "티어": "휴"}, {"id": "SSangBak", "이름": "이종열", "팀": 3, "종족": "T", "티어": "휴"}, {"id": "wassub", "이름": "이형섭", "팀": 3, "종족": "P", "티어": "휴"}, {"id": "Evicu", "이름": "변진황", "팀": 3, "종족": "P", "티어": "휴"}, {"id": "G9in", "이름": "정명열", "팀": 3, "종족": "P", "티어": "애"}, {"id": "PerfecT", "이름": "손정곤", "팀": 3, "종족": "T", "티어": "애"}, {"id": "CibalBattle", "이름": "정현우", "팀": 3, "종족": "Z", "티어": "애"}, {"id": "tRalala", "이름": "박지훈", "팀": 3, "종족": "Z", "티어": "애"}, {"id": "Hjvita", "이름": "양현철", "팀": 3, "종족": "P", "티어": "아"}, {"id": "catcat", "이름": "권노흠", "팀": 3, "종족": "Z", "티어": "아"}, {"id": "benpro", "이름": "임병헌", "팀": 3, "종족": "PT", "티어": "아"},
    {"id": "ShaDOw", "이름": "박재창", "팀": 4, "종족": "T", "티어": "갓"}, {"id": "Bullfrog", "이름": "오택삼", "팀": 4, "종족": "Z", "티어": "갓"}, {"id": "Alive", "이름": "이윤종", "팀": 4, "종족": "T", "티어": "갓"}, {"id": "sky9898", "이름": "최상균", "팀": 4, "종족": "ZP", "티어": "휴"}, {"id": "Sign1666", "이름": "김주한", "팀": 4, "종족": "P", "티어": "휴"}, {"id": "Naldo", "이름": "김이헌", "팀": 4, "종족": "Z", "티어": "휴"}, {"id": "TheMan", "이름": "조현용", "팀": 4, "종족": "P", "티어": "휴"}, {"id": "No-Gi", "이름": "유태욱", "팀": 4, "종족": "Z", "티어": "애"}, {"id": "Pixel", "이름": "임호진", "팀": 4, "종족": "T", "티어": "애"}, {"id": "Goat", "이름": "김동환", "팀": 4, "종족": "P", "티어": "애"}, {"id": "Tiempo", "이름": "이태경", "팀": 4, "종족": "T", "티어": "애"}, {"id": "GR", "이름": "박가람", "팀": 4, "종족": "P", "티어": "아"}, {"id": "Kakaru", "이름": "정주오", "팀": 4, "종족": "P", "티어": "아"}, {"id": "ZZAKSSON", "이름": "김재우", "팀": 4, "종족": "P", "티어": "아"},
    {"id": "Raon", "이름": "예의현", "팀": 5, "종족": "P", "티어": "갓"}, {"id": "HON", "이름": "장민수", "팀": 5, "종족": "Z", "티어": "갓"}, {"id": "King", "이름": "변정식", "팀": 5, "종족": "Z", "티어": "휴"}, {"id": "dOngkim!", "이름": "김동현", "팀": 5, "종족": "P", "티어": "휴"}, {"id": "berrykim", "이름": "주효진", "팀": 5, "종족": "Z", "티어": "휴"}, {"id": "Freeman", "이름": "박정진", "팀": 5, "종족": "P", "티어": "애"}, {"id": "home", "이름": "우병진", "팀": 5, "종족": "Z", "티어": "애"}, {"id": "gunstory", "이름": "공동건", "팀": 5, "종족": "Z", "티어": "애"}, {"id": "casino", "이름": "이정훈", "팀": 5, "종족": "PT", "티어": "애"}, {"id": "Xellos", "이름": "최화용", "팀": 5, "종족": "T", "티어": "애"}, {"id": "STeVe", "이름": "최수명", "팀": 5, "종족": "P", "티어": "아"}, {"id": "Valc", "이름": "이재혁", "팀": 5, "종족": "P", "티어": "아"}, {"id": "hahaha", "이름": "이윤호", "팀": 5, "종족": "Z", "티어": "아"},
    {"id": "Castle", "이름": "김종성", "팀": 6, "종족": "T", "티어": "갓"}, {"id": "ggamak", "이름": "정용석", "팀": 6, "종족": "Z", "티어": "갓"}, {"id": "Nope", "이름": "안태영", "팀": 6, "종족": "Z", "티어": "갓"}, {"id": "Atta", "이름": "이봉철", "팀": 6, "종족": "Z", "티어": "휴"}, {"id": "Panya", "이름": "조승일", "팀": 6, "종족": "P", "티어": "휴"}, {"id": "BMC", "이름": "장승룡", "팀": 6, "종족": "P", "티어": "휴"}, {"id": "JH", "이름": "손재현", "팀": 6, "종족": "Z", "티어": "휴"}, {"id": "sAviOr", "이름": "권혁준", "팀": 6, "종족": "R", "티어": "애"}, {"id": "JY", "이름": "황진영", "팀": 6, "종족": "Z", "티어": "애"}, {"id": "SeaSee", "이름": "김태준", "팀": 6, "종족": "P", "티어": "애"}, {"id": "glory", "이름": "황정동", "팀": 6, "종족": "R", "티어": "아"}, {"id": "Eco", "이름": "박지호", "팀": 6, "종족": "P", "티어": "아"}, {"id": "bradsk", "이름": "오석현", "팀": 6, "종족": "Z", "티어": "아"},
    {"id": "Ruin", "이름": "황찬종", "팀": 2, "종족": "Z", "티어": "아"}, {"id": "bass", "이름": "정종현", "팀": 3, "종족": "P", "티어": "갓"}, {"id": "Jogak", "이름": "권오선", "팀": 4, "종족": "Z", "티어": "애"}, {"id": "zergking", "이름": "김도현", "팀": 5, "종족": "Z", "티어": "휴"}
]

# 상위종족출전 예외처리
SUPERIOR_RACE_PLAYERS = {"강구산": 1, "김주한": 2}

# 분석할 파일 및 라운드 설정
script_dir = os.path.dirname(os.path.abspath(__file__))
FILE_NAME = os.path.join(script_dir, 'input.csv')
MIN_ROUND = 11
HTML_OUTPUT_FILE = os.path.join(script_dir, 'lgcraft_report.html')

# --- 함수 정의 --- #

def extract_players_revised(player_string):
    """선수 이름 문자열에서 순수한 한글 이름만 추출합니다."""
    if pd.isna(player_string):
        return []
    players_raw = player_string.split(',')
    players_clean = []
    hangul_pattern = re.compile(r'([가-힣]+)')
    for player_info in players_raw:
        name_part = player_info.split(':')[0].strip()
        match = hangul_pattern.match(name_part)
        if match:
            player_name = match.group(1).strip()
            if player_name:
                players_clean.append(player_name)
    return players_clean

def analyze_player_appearances(file_name, min_round, players_meta):
    """CSV 파일에서 선수별 출전 데이터를 분석하여 DataFrame으로 반환합니다."""
    try:
        df = pd.read_csv(file_name)
    except FileNotFoundError:
        print(f"오류: {file_name} 파일을 찾을 수 없습니다.")
        return None

    df_filtered = df[df['round'] >= min_round].copy()

    individual_counts = Counter()
    team_counts = Counter()
    ace_counts = Counter()

    for _, row in df_filtered.iterrows():
        match_type = row['type']
        tier = row.get('tier', '')
        for _, players_col in [('team1', 'team1_players'), ('team2', 'team2_players')]:
            players = extract_players_revised(row[players_col])
            for player in players:
                if match_type == '개인전':
                    individual_counts[player] += 1
                    if tier == '에이스':
                        ace_counts[player] += 1
                elif match_type == '팀전':
                    team_counts[player] += 1

    all_players_set = set(individual_counts.keys()) | set(team_counts.keys())
    final_df = pd.DataFrame(index=sorted(list(all_players_set)))
    final_df['개인전_출전_횟수'] = final_df.index.map(pd.Series(individual_counts)).fillna(0).astype(int)
    final_df['팀전 코인'] = final_df.index.map(pd.Series(team_counts)).fillna(0).astype(int)
    final_df['에이스_출전_횟수'] = final_df.index.map(pd.Series(ace_counts)).fillna(0).astype(int)
    final_df = final_df.reset_index().rename(columns={'index': '선수명'})

    players_df = pd.DataFrame(players_meta).rename(columns={'이름': '선수명'})
    merged_df = pd.merge(players_df, final_df, on='선수명', how='left')

    for col in ['개인전_출전_횟수', '팀전 코인', '에이스_출전_횟수']:
        if col in merged_df.columns:
            merged_df[col] = merged_df[col].fillna(0).astype(int)

    merged_df['상위종족출전'] = merged_df['선수명'].map(SUPERIOR_RACE_PLAYERS).fillna(0).astype(int)
    merged_df['개인전 코인'] = merged_df['개인전_출전_횟수'] - merged_df['에이스_출전_횟수'] - merged_df['상위종족출전']

    merged_df['총_출전_횟수'] = merged_df['개인전_출전_횟수'] + merged_df['팀전 코인']
    merged_df = merged_df.sort_values(by=['총_출전_횟수', '선수명'], ascending=[False, True]).drop(columns=['총_출전_횟수'])
    
    return merged_df

def generate_html_report(df, output_path):
    """DataFrame을 기반으로 검색, 정렬, 하이라이트 기능이 있는 HTML 보고서를 생성합니다."""
    if df is None:
        print("분석 데이터가 없어 HTML 보고서를 생성할 수 없습니다.")
        return
        
    df = df[['선수명', 'id', '팀', '종족', '티어', '개인전_출전_횟수', '에이스_출전_횟수', '상위종족출전', '개인전 코인', '팀전 코인']]

    header_html = '<tr>'
    for i, col in enumerate(df.columns):
        header_html += f'<th class="sortable" onclick="sortTable({i})">{col} <span class="sort-arrow"></span><br><input type="text" id="search-{i}" onkeyup="filterTable()" placeholder="검색..." onClick="event.stopPropagation()"></th>'
    header_html += '</tr>'

    body_html = ''
    for _, row in df.iterrows():
        body_html += '<tr>'
        tier = row['티어']
        individual_coin = row['개인전 코인']
        team_match_count = row['팀전 코인']

        for col_name, cell_value in row.items():
            class_name = ''
            if col_name == '개인전 코인':
                if tier in ['아', '갓']:
                    if individual_coin >= 6:
                        class_name = 'highlight-red'
                    elif individual_coin == 5:
                        class_name = 'highlight-orange'
                elif tier in ['애', '휴']:
                    if individual_coin >= 4:
                        class_name = 'highlight-red'
                    elif individual_coin == 3:
                        class_name = 'highlight-orange'
            elif col_name == '팀전 코인':
                if team_match_count >= 7:
                    class_name = 'highlight-red'
                elif team_match_count == 6:
                    class_name = 'highlight-orange'
            body_html += f'<td class="{class_name}">{cell_value}</td>'
        body_html += '</tr>'

    html_content = f'''
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <title>선수별 출전 기록</title>
        <style>
            body {{ font-family: sans-serif; margin: 2em; }}
            h1 {{ text-align: center; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
            th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            th {{ background-color: #f2f2f2; position: sticky; top: 0; }}
            th.sortable {{ cursor: pointer; }}
            th.sortable:hover {{ background-color: #e2e2e2; }}
            .sort-arrow {{ float: right; }}
            input[type="text"] {{ width: 95%; padding: 5px; margin-top: 5px; }}
            .highlight-red {{ background-color: #ffcdd2; }} /* 연한 빨강 */
            .highlight-orange {{ background-color: #ffcc80; }} /* 연한 주황 */
        </style>
    </head>
    <body>
        <h1>선수별 출전 기록 (라운드 {MIN_ROUND}부터)</h1>
        <table id="reportTable">
            <thead>{header_html}</thead>
            <tbody>{body_html}</tbody>
        </table>
        <script>
            let sortDirections = [];

            function sortTable(columnIndex) {{
                const table = document.getElementById("reportTable");
                const tbody = table.tBodies[0];
                const rows = Array.from(tbody.getElementsByTagName("tr"));
                const ths = table.getElementsByTagName("th");

                // Initialize sort directions if not already
                if (sortDirections.length === 0) {{
                    for(let i = 0; i < ths.length; i++) {{
                        sortDirections.push('');
                    }}
                }}

                const currentDirection = sortDirections[columnIndex];
                const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';

                // Reset all arrows and directions
                for(let i = 0; i < ths.length; i++) {{
                    ths[i].querySelector('.sort-arrow').innerHTML = '';
                    sortDirections[i] = '';
                }}

                // Set new direction and arrow for the clicked column
                sortDirections[columnIndex] = newDirection;
                ths[columnIndex].querySelector('.sort-arrow').innerHTML = newDirection === 'asc' ? ' ▲' : ' ▼';

                rows.sort((a, b) => {{
                    const aText = a.cells[columnIndex].textContent.trim();
                    const bText = b.cells[columnIndex].textContent.trim();

                    const aNum = parseFloat(aText);
                    const bNum = parseFloat(bText);

                    let valA, valB;

                    if (!isNaN(aNum) && !isNaN(bNum)) {{
                        valA = aNum;
                        valB = bNum;
                    }} else {{
                        valA = aText.toLowerCase();
                        valB = bText.toLowerCase();
                    }}

                    if (valA < valB) {{
                        return newDirection === 'asc' ? -1 : 1;
                    }}
                    if (valA > valB) {{
                        return newDirection === 'asc' ? 1 : -1;
                    }}
                    return 0;
                }});

                rows.forEach(row => tbody.appendChild(row));
            }}

            function filterTable() {{
                let inputs = [];
                let table = document.getElementById("reportTable");
                let tr = table.getElementsByTagName("tr");

                let th = table.getElementsByTagName("th");
                for (let i = 0; i < th.length; i++) {{
                    inputs.push(document.getElementById(`search-${{i}}`).value.toUpperCase());
                }}

                for (let i = 1; i < tr.length; i++) {{ 
                    let tds = tr[i].getElementsByTagName("td");
                    let display = true;
                    for (let j = 0; j < tds.length; j++) {{
                        let td = tds[j];
                        if (td) {{
                            let textValue = td.textContent || td.innerText;
                            if (inputs[j] && textValue.toUpperCase().indexOf(inputs[j]) === -1) {{
                                display = false;
                                break;
                            }}
                        }}
                    }}
                    tr[i].style.display = display ? "" : "none";
                }}
            }}
        </script>
    </body>
    </html>
    '''

    try:
        with open(output_path, 'w', encoding='utf-8-sig') as f:
            f.write(html_content)
        print(f"성공: HTML 보고서가 '{output_path}' 파일로 저장되었습니다.")
    except Exception as e:
        print(f"오류: HTML 파일을 저장하는 중 문제가 발생했습니다 - {e}")

# --- 스크립트 실행 --- #

if __name__ == "__main__":
    analysis_result_df = analyze_player_appearances(FILE_NAME, MIN_ROUND, PLAYERS_META)
    generate_html_report(analysis_result_df, HTML_OUTPUT_FILE)