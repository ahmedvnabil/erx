from urllib.robotparser import RobotFileParser


def robots_allows(robots_text: str, url: str, user_agent: str) -> bool:
    parser = RobotFileParser()
    parser.parse(robots_text.splitlines())
    return parser.can_fetch(user_agent, url)
