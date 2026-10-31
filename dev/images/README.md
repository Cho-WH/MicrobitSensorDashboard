# 안내 이미지

`python -m pip install -r dev/images/requirements.txt` 후 `python dev/images/build.py`로 표시용 WebP 두 크기와 경로 목록을 생성한다. 일반 앱 빌드에는 Python을 사용하지 않는다.

원본 PNG의 그림·출처는 유지한다. 긴 변 1280px/640px 이내, 품질 88로 생성하며 종횡비와 투명도를 유지한다. `asset-url`이 등록된 원본 주소를 WebP로 연결하고, 안내 UI는 공통 `guide-image`를 통해 화면 크기에 맞는 파일을 선택한다. 새 그림을 추가하거나 원본을 바꾸면 파생 파일과 목록도 함께 갱신한다.
