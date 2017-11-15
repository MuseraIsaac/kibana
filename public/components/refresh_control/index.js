import { connect } from 'react-redux';

import { RefreshControl as Component } from './refresh_control';
import { fetchAllRenderables } from '../../state/actions/elements';
import { setRefreshInterval } from '../../state/actions/workpad';
import { getInFlight } from '../../state/selectors/resolved_args';
import { getRefreshInterval } from '../../state/selectors/workpad';

const mapStateToProps = (state) => ({
  inFlight: getInFlight(state),
  refreshInterval: getRefreshInterval(state),
});

const mapDispatchToProps = ({
  doRefresh: fetchAllRenderables,
  setRefreshInterval,
});

export const RefreshControl = connect(mapStateToProps, mapDispatchToProps)(Component);
