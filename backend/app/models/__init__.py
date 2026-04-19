# Import all models so Base.metadata.create_all picks them up
from app.models.alert import Alert  # noqa: F401
from app.models.camera import Camera  # noqa: F401
from app.models.event_profile import EventProfile  # noqa: F401
from app.models.plate import PlateRead  # noqa: F401
from app.models.track import Track  # noqa: F401
