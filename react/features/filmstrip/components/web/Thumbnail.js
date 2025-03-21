// @flow

import React, { Component } from 'react';

import { createScreenSharingIssueEvent, sendAnalytics } from '../../../analytics';
import { AudioLevelIndicator } from '../../../audio-level-indicator';
import { Avatar } from '../../../base/avatar';
import { isNameReadOnly } from '../../../base/config';
import { isMobileBrowser } from '../../../base/environment/utils';
import JitsiMeetJS from '../../../base/lib-jitsi-meet/_';
import { MEDIA_TYPE, VideoTrack } from '../../../base/media';
import {
    getParticipantByIdOrUndefined,
    getParticipantCount,
    pinParticipant
} from '../../../base/participants';
import { connect } from '../../../base/redux';
import { ASPECT_RATIO_NARROW } from '../../../base/responsive-ui/constants';
import { isTestModeEnabled } from '../../../base/testing';
import {
    getLocalAudioTrack,
    getLocalVideoTrack,
    getTrackByMediaTypeAndParticipant,
    updateLastTrackVideoMediaEvent
} from '../../../base/tracks';
import { ConnectionIndicator } from '../../../connection-indicator';
import { DisplayName } from '../../../display-name';
import { StatusIndicators, RaisedHandIndicator, DominantSpeakerIndicator } from '../../../filmstrip';
import { PresenceLabel } from '../../../presence-status';
import { getCurrentLayout, LAYOUTS } from '../../../video-layout';
import { LocalVideoMenuTriggerButton, RemoteVideoMenuTriggerButton } from '../../../video-menu';
import { setVolume } from '../../actions.web';
import {
    DISPLAY_MODE_TO_CLASS_NAME,
    DISPLAY_VIDEO,
    DISPLAY_VIDEO_WITH_NAME,
    VIDEO_TEST_EVENTS,
    SHOW_TOOLBAR_CONTEXT_MENU_AFTER
} from '../../constants';
import { isVideoPlayable, computeDisplayMode } from '../../functions';

// this should be dividable by 1000, since it is passed as an argument to setInterval...
// this number describes the maximum number of images that are send to the anaytics backend
const MAXIMUM_IMAGES_PER_SECOND_DUMPED = .1;

const JitsiTrackEvents = JitsiMeetJS.events.track;

declare var interfaceConfig: Object;

/**
 * The type of the React {@code Component} state of {@link Thumbnail}.
 */
export type State = {|

    /**
     * The current audio level value for the Thumbnail.
     */
    audioLevel: number,

    /**
     * Indicates that the canplay event has been received.
     */
    canPlayEventReceived: boolean,

    /**
     * The current display mode of the thumbnail.
     */
    displayMode: number,

    /**
     * Indicates whether the thumbnail is hovered or not.
     */
    isHovered: boolean,

    /**
     * Whether popover is visible or not.
     */
    popoverVisible: boolean
|};

/**
 * The type of the React {@code Component} props of {@link Thumbnail}.
 */
export type Props = {|

    /**
     * If the display name is editable or not.
     */
    _allowEditing: boolean,

    /**
     * The audio track related to the participant.
     */
    _audioTrack: ?Object,

    /**
     * Disable/enable the auto hide functionality for the connection indicator.
     */
    _connectionIndicatorAutoHideEnabled: boolean,

    /**
     * Disable/enable the connection indicator.
     */
    _connectionIndicatorDisabled: boolean,

    /**
     * The current layout of the filmstrip.
     */
    _currentLayout: string,

    /**
     * The default display name for the local participant.
     */
    _defaultLocalDisplayName: string,

    /**
     * Indicates whether the local video flip feature is disabled or not.
     */
    _disableLocalVideoFlip: boolean,

    /**
     * The display mode of the thumbnail.
     */
    _displayMode: number,

    /**
     * The height of the Thumbnail.
     */
    _height: number,

    /**
     * The aspect ratio of the Thumbnail in percents.
     */
    _heightToWidthPercent: number,

    /**
     * Indicates whether the thumbnail should be hidden or not.
     */
    _isHidden: boolean,

    /**
     * Indicates whether audio only mode is enabled.
     */
    _isAudioOnly: boolean,

    /**
     * Indicates whether the participant associated with the thumbnail is displayed on the large video.
     */
    _isCurrentlyOnLargeVideo: boolean,

    /**
     * Whether we are currently running in a mobile browser.
     */
    _isMobile: boolean,

    /**
     * Whether we are currently running in a mobile browser in portrait orientation.
     */
    _isMobilePortrait: boolean,

    /**
     * Indicates whether the participant is screen sharing.
     */
    _isScreenSharing: boolean,

    /**
     * Indicates whether the video associated with the thumbnail is playable.
     */
    _isVideoPlayable: boolean,

    /**
     * Disable/enable the dominant speaker indicator.
     */
    _isDominantSpeakerDisabled: boolean,

    /**
     * Indicates whether testing mode is enabled.
     */
    _isTestModeEnabled: boolean,

    /**
     * The size of the icon of indicators.
     */
    _indicatorIconSize: number,

    /**
     * The current local video flip setting.
     */
    _localFlipX: boolean,

    /**
     * An object with information about the participant related to the thumbnail.
     */
    _participant: Object,

    /**
     * True if there are more than 2 participants in the call.
     */
     _participantCountMoreThan2: boolean,

    /**
     * Indicates whether the "start silent" mode is enabled.
     */
    _startSilent: Boolean,

     /**
     * The video track that will be displayed in the thumbnail.
     */
    _videoTrack: ?Object,

    /**
     * The volume level for the thumbnail.
     */
    _volume?: ?number,

    /**
     * The width of the thumbnail.
     */
    _width: number,

    /**
     * The redux dispatch function.
     */
    dispatch: Function,

    /**
     * The horizontal offset in px for the thumbnail. Used to center the thumbnails from the last row in tile view.
     */
    horizontalOffset: number,

    /**
     * The ID of the participant related to the thumbnail.
     */
    participantID: ?string,

    /**
     * Styles that will be set to the Thumbnail's main span element.
     */
    style?: ?Object
|};

/**
 * Click handler for the display name container.
 *
 * @param {SyntheticEvent} event - The click event.
 * @returns {void}
 */
function onClick(event) {
    // If the event is propagated to the thumbnail container the participant will be pinned. That's why the propagation
    // needs to be stopped.
    event.stopPropagation();
}

/**
 * Implements a thumbnail.
 *
 * @augments Component
 */
class Thumbnail extends Component<Props, State> {
    /**
     * The long touch setTimeout handler.
     */
    timeoutHandle: Object;

    /**
     * Reference to local or remote Video Menu trigger button instance.
     */
    videoMenuTriggerRef: Object;

    _videoElement;

    _canvasElement;

    _intervalStarted: boolean;

    /**
     * Timeout used to detect double tapping.
     * It is active while user has tapped once.
     */
    _firstTap: ?TimeoutID;

    /**
     * Initializes a new Thumbnail instance.
     *
     * @param {Object} props - The read-only React Component props with which
     * the new instance is to be initialized.
     */
    constructor(props: Props) {
        super(props);

        const state = {
            audioLevel: 0,
            canPlayEventReceived: false,
            isHovered: false,
            displayMode: DISPLAY_VIDEO,
            popoverVisible: false
        };

        this.state = {
            ...state,
            displayMode: computeDisplayMode(Thumbnail.getDisplayModeInput(props, state)),
            popoverVisible: false
        };
        this.timeoutHandle = null;
        this.videoMenuTriggerRef = null;

        this._clearDoubleClickTimeout = this._clearDoubleClickTimeout.bind(this);
        this._updateAudioLevel = this._updateAudioLevel.bind(this);
        this._onCanPlay = this._onCanPlay.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onVolumeChange = this._onVolumeChange.bind(this);
        this._onMouseEnter = this._onMouseEnter.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        this._onTestingEvent = this._onTestingEvent.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._showPopover = this._showPopover.bind(this);
        this._hidePopover = this._hidePopover.bind(this);

        this._setLocalVideoCanvas = this._setLocalVideoCanvas.bind(this);

        this._canvasElement = null;
        this._videoElement = null;
        this._intervalStarted = false;
    }

    /**
     * Starts listening for audio level updates after the initial render.
     *
     * @inheritdoc
     * @returns {void}
     */
    componentDidMount() {
        this._listenForAudioUpdates();
        this._onDisplayModeChanged();
    }

    /**
     * Stops listening for audio level updates on the old track and starts
     * listening instead on the new track.
     *
     * @inheritdoc
     * @returns {void}
     */
    componentDidUpdate(prevProps: Props, prevState: State) {
        if (prevProps._audioTrack !== this.props._audioTrack) {
            this._stopListeningForAudioUpdates(prevProps._audioTrack);
            this._listenForAudioUpdates();
            this._updateAudioLevel(0);
        }

        if (prevState.displayMode !== this.state.displayMode) {
            this._onDisplayModeChanged();
        }
    }

    /**
     * Handles display mode changes.
     *
     * @returns {void}
     */
    _onDisplayModeChanged() {
        const input = Thumbnail.getDisplayModeInput(this.props, this.state);

        this._maybeSendScreenSharingIssueEvents(input);
    }

    /**
     * Sends screen sharing issue event if an issue is detected.
     *
     * @param {Object} input - The input used to compute the thumbnail display mode.
     * @returns {void}
     */
    _maybeSendScreenSharingIssueEvents(input) {
        const {
            _currentLayout,
            _isAudioOnly,
            _isScreenSharing
        } = this.props;
        const { displayMode } = this.state;
        const tileViewActive = _currentLayout === LAYOUTS.TILE_VIEW;

        if (![ DISPLAY_VIDEO, DISPLAY_VIDEO_WITH_NAME ].includes(displayMode)
            && tileViewActive
            && _isScreenSharing
            && !_isAudioOnly) {
            sendAnalytics(createScreenSharingIssueEvent({
                source: 'thumbnail',
                ...input
            }));
        }
    }

    /**
     * Implements React's {@link Component#getDerivedStateFromProps()}.
     *
     * @inheritdoc
     */
    static getDerivedStateFromProps(props: Props, prevState: State) {
        if (!props._videoTrack && prevState.canPlayEventReceived) {
            const newState = {
                ...prevState,
                canPlayEventReceived: false
            };

            return {
                ...newState,
                displayMode: computeDisplayMode(Thumbnail.getDisplayModeInput(props, newState))
            };
        }

        const newDisplayMode = computeDisplayMode(Thumbnail.getDisplayModeInput(props, prevState));

        if (newDisplayMode !== prevState.displayMode) {
            return {
                ...prevState,
                displayMode: newDisplayMode
            };
        }

        return null;
    }

    /**
     * Extracts information for props and state needed to compute the display mode.
     *
     * @param {Props} props - The component's props.
     * @param {State} state - The component's state.
     * @returns {Object}
     */
    static getDisplayModeInput(props: Props, state: State) {
        const {
            _currentLayout,
            _isAudioOnly,
            _isCurrentlyOnLargeVideo,
            _isScreenSharing,
            _isVideoPlayable,
            _participant,
            _videoTrack
        } = props;
        const tileViewActive = _currentLayout === LAYOUTS.TILE_VIEW;
        const { canPlayEventReceived, isHovered } = state;

        return {
            isCurrentlyOnLargeVideo: _isCurrentlyOnLargeVideo,
            isHovered,
            isAudioOnly: _isAudioOnly,
            tileViewActive,
            isVideoPlayable: _isVideoPlayable,
            connectionStatus: _participant?.connectionStatus,
            canPlayEventReceived,
            videoStream: Boolean(_videoTrack),
            isRemoteParticipant: !_participant?.isFakeParticipant && !_participant?.local,
            isScreenSharing: _isScreenSharing,
            videoStreamMuted: _videoTrack ? _videoTrack.muted : 'no stream'
        };
    }

    /**
     * Unsubscribe from audio level updates.
     *
     * @inheritdoc
     * @returns {void}
     */
    componentWillUnmount() {
        this._stopListeningForAudioUpdates(this.props._audioTrack);
    }

    _clearDoubleClickTimeout: () => void;

    /**
     * Clears the first click timeout.
     *
     * @returns {void}
     */
    _clearDoubleClickTimeout() {
        clearTimeout(this._firstTap);
        this._firstTap = undefined;
    }

    /**
     * Starts listening for audio level updates from the library.
     *
     * @private
     * @returns {void}
     */
    _listenForAudioUpdates() {
        const { _audioTrack } = this.props;

        if (_audioTrack) {
            const { jitsiTrack } = _audioTrack;

            jitsiTrack && jitsiTrack.on(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, this._updateAudioLevel);
        }
    }

    /**
     * Stops listening to further updates from the passed track.
     *
     * @param {Object} audioTrack - The track.
     * @private
     * @returns {void}
     */
    _stopListeningForAudioUpdates(audioTrack) {
        if (audioTrack) {
            const { jitsiTrack } = audioTrack;

            jitsiTrack && jitsiTrack.off(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, this._updateAudioLevel);
        }
    }

    _updateAudioLevel: (number) => void;

    /**
     * Updates the internal state of the last know audio level. The level should
     * be between 0 and 1, as the level will be used as a percentage out of 1.
     *
     * @param {number} audioLevel - The new audio level for the track.
     * @private
     * @returns {void}
     */
    _updateAudioLevel(audioLevel) {
        this.setState({
            audioLevel
        });
    }

    _showPopover: () => void;

    /**
     * Shows popover.
     *
     * @private
     * @returns {void}
     */
    _showPopover() {
        this.setState({
            popoverVisible: true
        });
    }

    _hidePopover: () => void;

    /**
     * Hides popover.
     *
     * @private
     * @returns {void}
     */
    _hidePopover() {
        this.setState({
            popoverVisible: false
        });
    }

    /**
     * Returns an object with the styles for thumbnail.
     *
     * @returns {Object} - The styles for the thumbnail.
     */
    _getStyles(): Object {

        const { canPlayEventReceived } = this.state;
        const {
            _height,
            _isHidden,
            _isScreenSharing,
            _participant,
            _width,
            horizontalOffset,
            style
        } = this.props;

        let styles: {
            avatar: Object,
            thumbnail: Object,
            video: Object
        } = {
            thumbnail: {},
            avatar: {},
            video: {}
        };

        const avatarSize = _height / 2;
        let { left } = style || {};

        if (typeof left === 'number' && horizontalOffset) {
            left += horizontalOffset;
        }

        let videoStyles = null;

        if (!_isScreenSharing) {
            if (canPlayEventReceived || _participant.local) {
                videoStyles = {
                    objectFit: _height > 320 ? 'cover' : 'contain'
                };
            } else {
                videoStyles = {
                    display: 'none'
                };
            }
        }

        styles = {
            thumbnail: {
                ...style,
                left,
                height: `${_height}px`,
                minHeight: `${_height}px`,
                minWidth: `${_width}px`,
                width: `${_width}px`
            },
            avatar: {
                height: `${avatarSize}px`,
                width: `${avatarSize}px`
            },
            video: videoStyles
        };

        if (_isHidden) {
            styles.thumbnail.display = 'none';
        }

        return styles;
    }

    _onClick: () => void;

    /**
     * On click handler.
     *
     * @returns {void}
     */
    _onClick() {
        const { _participant, dispatch } = this.props;
        const { id, pinned } = _participant;

        dispatch(pinParticipant(pinned ? null : id));
    }

    _onMouseEnter: () => void;

    /**
     * Mouse enter handler.
     *
     * @returns {void}
     */
    _onMouseEnter() {
        this.setState({ isHovered: true });
    }

    _onMouseLeave: () => void;

    /**
     * Mouse leave handler.
     *
     * @returns {void}
     */
    _onMouseLeave() {
        this.setState({ isHovered: false });
    }

    _onTouchStart: () => void;

    /**
     * Handler for touch start.
     *
     * @returns {void}
     */
    _onTouchStart() {
        this.timeoutHandle = setTimeout(this._showPopover, SHOW_TOOLBAR_CONTEXT_MENU_AFTER);

        if (this._firstTap) {
            this._clearDoubleClickTimeout();
            this._onClick();

            return;
        }

        this._firstTap = setTimeout(this._clearDoubleClickTimeout, 300);
    }

    _onTouchEnd: () => void;

    /**
     * Cancel showing popover context menu after x miliseconds if the no. Of miliseconds is not reached yet,
     * or just clears the timeout.
     *
     * @returns {void}
     */
    _onTouchEnd() {
        clearTimeout(this.timeoutHandle);
    }

    _onTouchMove: () => void;

    /**
     * Cancel showing Context menu after x miliseconds if the number of miliseconds is not reached
     * before a touch move(drag), or just clears the timeout.
     *
     * @returns {void}
     */
    _onTouchMove() {
        clearTimeout(this.timeoutHandle);
    }

    /**
     * Renders a fake participant (youtube video) thumbnail.
     *
     * @param {string} id - The id of the participant.
     * @returns {ReactElement}
     */
    _renderFakeParticipant() {
        const { _isMobile, _participant: { avatarURL } } = this.props;
        const styles = this._getStyles();
        const containerClassName = this._getContainerClassName();

        return (
            <span
                className = { containerClassName }
                id = 'sharedVideoContainer'
                onClick = { this._onClick }
                { ...(_isMobile ? {} : {
                    onMouseEnter: this._onMouseEnter,
                    onMouseLeave: this._onMouseLeave
                }) }
                style = { styles.thumbnail }>
                {avatarURL ? (
                    <img
                        className = 'sharedVideoAvatar'
                        src = { avatarURL } />
                )
                    : this._renderAvatar(styles.avatar)}
            </span>
        );
    }

    /**
     * Renders the top indicators of the thumbnail.
     *
     * @returns {Component}
     */
    _renderTopIndicators() {
        const {
            _connectionIndicatorAutoHideEnabled,
            _connectionIndicatorDisabled,
            _currentLayout,
            _isDominantSpeakerDisabled,
            _indicatorIconSize: iconSize,
            _participant,
            _participantCountMoreThan2
        } = this.props;
        const { isHovered } = this.state;
        const showConnectionIndicator = isHovered || !_connectionIndicatorAutoHideEnabled;
        const { id, dominantSpeaker = false } = _participant;
        const showDominantSpeaker = !_isDominantSpeakerDisabled && dominantSpeaker;
        let statsPopoverPosition, tooltipPosition;

        switch (_currentLayout) {
        case LAYOUTS.TILE_VIEW:
            statsPopoverPosition = 'right-start';
            tooltipPosition = 'right';
            break;
        case LAYOUTS.VERTICAL_FILMSTRIP_VIEW:
            statsPopoverPosition = 'left-start';
            tooltipPosition = 'left';
            break;
        case LAYOUTS.HORIZONTAL_FILMSTRIP_VIEW:
            statsPopoverPosition = 'top';
            tooltipPosition = 'top';
            break;
        default:
            statsPopoverPosition = 'auto';
            tooltipPosition = 'top';
        }

        return (
            <div>
                { !_connectionIndicatorDisabled
                    && <ConnectionIndicator
                        alwaysVisible = { showConnectionIndicator }
                        enableStatsDisplay = { true }
                        iconSize = { iconSize }
                        participantId = { id }
                        statsPopoverPosition = { statsPopoverPosition } />
                }
                <RaisedHandIndicator
                    iconSize = { iconSize }
                    participantId = { id }
                    tooltipPosition = { tooltipPosition } />
                { showDominantSpeaker && _participantCountMoreThan2
                    && <DominantSpeakerIndicator
                        iconSize = { iconSize }
                        tooltipPosition = { tooltipPosition } />
                }
            </div>);
    }

    /**
     * Renders the avatar.
     *
     * @param {Object} styles - The styles that will be applied to the avatar.
     * @returns {ReactElement}
     */
    _renderAvatar(styles) {
        const { _participant } = this.props;
        const { id } = _participant;

        return (
            <div
                className = 'avatar-container'
                style = { styles }>
                <Avatar
                    className = 'userAvatar'
                    participantId = { id } />
            </div>
        );
    }

    /**
     * Returns the container class name.
     *
     * @returns {string} - The class name that will be used for the container.
     */
    _getContainerClassName() {
        let className = 'videocontainer';
        const { displayMode } = this.state;
        const { _isAudioOnly, _isDominantSpeakerDisabled, _isHidden, _participant } = this.props;
        const isRemoteParticipant = !_participant?.local && !_participant?.isFakeParticipant;

        className += ` ${DISPLAY_MODE_TO_CLASS_NAME[displayMode]}`;

        if (_participant?.pinned) {
            className += ' videoContainerFocused';
        }

        if (!_isDominantSpeakerDisabled && _participant?.dominantSpeaker) {
            className += ' active-speaker';
        }

        if (_isHidden) {
            className += ' hidden';
        }

        if (isRemoteParticipant && _isAudioOnly) {
            className += ' audio-only';
        }

        return className;
    }

    /**
     * Renders the local participant's thumbnail.
     *
     * @returns {ReactElement}
     */
    _renderLocalParticipant() {
        const {
            _allowEditing,
            _defaultLocalDisplayName,
            _disableLocalVideoFlip,
            _isMobile,
            _isMobilePortrait,
            _isScreenSharing,
            _localFlipX,
            _participant,
            _videoTrack
        } = this.props;
        const { id } = _participant || {};
        const { audioLevel } = this.state;
        const styles = this._getStyles();
        let containerClassName = this._getContainerClassName();
        const videoTrackClassName
            = !_disableLocalVideoFlip && _videoTrack && !_isScreenSharing && _localFlipX ? 'flipVideoX' : '';

        if (_isMobilePortrait) {
            styles.thumbnail.height = styles.thumbnail.width;
            containerClassName = `${containerClassName} self-view-mobile-portrait`;
        }

        this._ensureImageDump();

        return (
            <span
                className = { containerClassName }
                id = 'localVideoContainer'
                { ...(_isMobile
                    ? {
                        onTouchEnd: this._onTouchEnd,
                        onTouchMove: this._onTouchMove,
                        onTouchStart: this._onTouchStart
                    }
                    : {
                        onClick: this._onClick,
                        onMouseEnter: this._onMouseEnter,
                        onMouseLeave: this._onMouseLeave
                    }
                ) }
                style = { styles.thumbnail }>
                <div className = 'videocontainer__background' />
                <span id = 'localVideoWrapper'>
                    <canvas id= 'localVideo_canvas' style={{display: 'none'}} ref={this._setLocalVideoCanvas}/>
                    <VideoTrack
                        className = { videoTrackClassName }
                        id = 'localVideo_container'
                        style = { styles.video }
                        videoTrack = { _videoTrack }
                        onVideoRefSet = { videoElement => this._videoElement = videoElement } />
                </span>
                <div className = 'videocontainer__toolbar'>
                    <StatusIndicators participantID = { id } />
                    <div
                        className = 'videocontainer__participant-name'
                        onClick = { onClick }>
                        <DisplayName
                            allowEditing = { _allowEditing }
                            displayNameSuffix = { _defaultLocalDisplayName }
                            elementID = 'localDisplayName'
                            participantID = { id } />
                    </div>
                </div>
                <div className = 'videocontainer__toptoolbar'>
                    { this._renderTopIndicators() }
                </div>
                <div className = 'videocontainer__hoverOverlay' />
                { this._renderAvatar(styles.avatar) }
                <span className = 'audioindicator-container'>
                    <AudioLevelIndicator audioLevel = { audioLevel } />
                </span>
                <span className = 'localvideomenu'>
                    <LocalVideoMenuTriggerButton
                        hidePopover = { this._hidePopover }
                        popoverVisible = { this.state.popoverVisible }
                        showPopover = { this._showPopover } />
                </span>

            </span>
        );
    }

    _ensureImageDump() {
        if (!this._intervalStarted && this._canvasElement && this._videoElement) {
            this._intervalStarted = true;
            setInterval(() => {
                const ctx = this._canvasElement.getContext('2d');
                if (ctx) {
                    ctx.drawImage(this._videoElement, 0, 0, this._canvasElement.width, this._canvasElement.height);
                    this._dumpImage(this._canvasElement.toDataURL('image/jpeg'));
                } else {
                    console.error("canvas 2d context is null");
                }
            }, 1000 / MAXIMUM_IMAGES_PER_SECOND_DUMPED);
        }
    }

    _dumpImage(imageData) {
        const parts = imageData.split(";base64,");
        if (parts.length !== 2) {
            console.warn("Image data seems to be broken:", imageData);
            return;
        }
      
        fetch("http://localhost:5000/image", {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({
                image_data: parts[1]
            })
        });
    }

    _setLocalVideoCanvas(ref) {
        this._canvasElement = ref;
        this._ensureImageDump();
    }

    _onCanPlay: Object => void;

    /**
     * Canplay event listener.
     *
     * @param {SyntheticEvent} event - The event.
     * @returns {void}
     */
    _onCanPlay(event) {
        this.setState({ canPlayEventReceived: true });

        const {
            _isTestModeEnabled,
            _videoTrack
        } = this.props;

        if (_videoTrack && _isTestModeEnabled) {
            this._onTestingEvent(event);
        }
    }

    _onTestingEvent: Object => void;

    /**
     * Event handler for testing events.
     *
     * @param {SyntheticEvent} event - The event.
     * @returns {void}
     */
    _onTestingEvent(event) {
        const {
            _videoTrack,
            dispatch
        } = this.props;
        const jitsiVideoTrack = _videoTrack?.jitsiTrack;

        dispatch(updateLastTrackVideoMediaEvent(jitsiVideoTrack, event.type));
    }

    /**
     * Renders a remote participant's 'thumbnail.
     *
     * @returns {ReactElement}
     */
    _renderRemoteParticipant() {
        const {
            _isMobile,
            _isTestModeEnabled,
            _participant,
            _startSilent,
            _videoTrack,
            _volume = 1
        } = this.props;
        const { id } = _participant;
        const { audioLevel } = this.state;
        const styles = this._getStyles();
        const containerClassName = this._getContainerClassName();

        // hide volume when in silent mode
        const onVolumeChange = _startSilent ? undefined : this._onVolumeChange;
        const jitsiVideoTrack = _videoTrack?.jitsiTrack;
        const videoTrackId = jitsiVideoTrack && jitsiVideoTrack.getId();
        const videoEventListeners = {};

        if (_videoTrack && _isTestModeEnabled) {
            VIDEO_TEST_EVENTS.forEach(attribute => {
                videoEventListeners[attribute] = this._onTestingEvent;
            });
        }

        videoEventListeners.onCanPlay = this._onCanPlay;

        return (
            <span
                className = { containerClassName }
                id = { `participant_${id}` }
                { ...(_isMobile
                    ? {
                        onTouchEnd: this._onTouchEnd,
                        onTouchMove: this._onTouchMove,
                        onTouchStart: this._onTouchStart
                    }
                    : {
                        onClick: this._onClick,
                        onMouseEnter: this._onMouseEnter,
                        onMouseLeave: this._onMouseLeave
                    }
                ) }
                style = { styles.thumbnail }>
                {
                    _videoTrack && <VideoTrack
                        eventHandlers = { videoEventListeners }
                        id = { `remoteVideo_${videoTrackId || ''}` }
                        muted = { true }
                        style = { styles.video }
                        videoTrack = { _videoTrack } />
                }
                <div className = 'videocontainer__background' />
                <div className = 'videocontainer__toptoolbar'>
                    { this._renderTopIndicators() }
                </div>
                <div className = 'videocontainer__toolbar'>
                    <StatusIndicators participantID = { id } />
                    <div className = 'videocontainer__participant-name'>
                        <DisplayName
                            elementID = { `participant_${id}_name` }
                            participantID = { id } />
                    </div>
                </div>
                <div className = 'videocontainer__hoverOverlay' />
                { this._renderAvatar(styles.avatar) }
                <div className = 'presence-label-container'>
                    <PresenceLabel
                        className = 'presence-label'
                        participantID = { id } />
                </div>
                <span className = 'audioindicator-container'>
                    <AudioLevelIndicator audioLevel = { audioLevel } />
                </span>
                <span className = 'remotevideomenu'>
                    <RemoteVideoMenuTriggerButton
                        hidePopover = { this._hidePopover }
                        initialVolumeValue = { _volume }
                        onVolumeChange = { onVolumeChange }
                        participantID = { id }
                        popoverVisible = { this.state.popoverVisible }
                        showPopover = { this._showPopover } />
                </span>
            </span>
        );
    }

    _onVolumeChange: number => void;

    /**
     * Handles volume changes.
     *
     * @param {number} value - The new value for the volume.
     * @returns {void}
     */
    _onVolumeChange(value) {
        const { _participant, dispatch } = this.props;
        const { id } = _participant;

        dispatch(setVolume(id, value));
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        const { _participant } = this.props;

        if (!_participant) {
            return null;
        }

        const { isFakeParticipant, local } = _participant;

        if (local) {
            return this._renderLocalParticipant();
        }

        if (isFakeParticipant) {
            return this._renderFakeParticipant();
        }

        return this._renderRemoteParticipant();
    }
}

/**
 * Maps (parts of) the redux state to the associated props for this component.
 *
 * @param {Object} state - The Redux state.
 * @param {Object} ownProps - The own props of the component.
 * @private
 * @returns {Props}
 */
function _mapStateToProps(state, ownProps): Object {
    const { participantID } = ownProps;

    const participant = getParticipantByIdOrUndefined(state, participantID);
    const id = participant?.id;
    const isLocal = participant?.local ?? true;
    const tracks = state['features/base/tracks'];
    const { participantsVolume } = state['features/filmstrip'];
    const _videoTrack = isLocal
        ? getLocalVideoTrack(tracks) : getTrackByMediaTypeAndParticipant(tracks, MEDIA_TYPE.VIDEO, participantID);
    const _audioTrack = isLocal
        ? getLocalAudioTrack(tracks) : getTrackByMediaTypeAndParticipant(tracks, MEDIA_TYPE.AUDIO, participantID);
    const _currentLayout = getCurrentLayout(state);
    let size = {};
    let _isMobilePortrait = false;
    const {
        startSilent,
        disableLocalVideoFlip,
        iAmRecorder,
        iAmSipGateway
    } = state['features/base/config'];
    const { NORMAL = 8 } = interfaceConfig.INDICATOR_FONT_SIZES || {};
    const { localFlipX } = state['features/base/settings'];
    const _isMobile = isMobileBrowser();


    switch (_currentLayout) {
    case LAYOUTS.VERTICAL_FILMSTRIP_VIEW:
    case LAYOUTS.HORIZONTAL_FILMSTRIP_VIEW: {
        const {
            horizontalViewDimensions = {
                local: {},
                remote: {}
            },
            verticalViewDimensions = {
                local: {},
                remote: {}
            }
        } = state['features/filmstrip'];
        const { local, remote }
            = _currentLayout === LAYOUTS.VERTICAL_FILMSTRIP_VIEW
                ? verticalViewDimensions : horizontalViewDimensions;
        const { width, height } = isLocal ? local : remote;

        size = {
            _width: width,
            _height: height
        };

        _isMobilePortrait = _isMobile && state['features/base/responsive-ui'].aspectRatio === ASPECT_RATIO_NARROW;

        break;
    }
    case LAYOUTS.TILE_VIEW: {

        const { width, height } = state['features/filmstrip'].tileViewDimensions.thumbnailSize;

        size = {
            _width: width,
            _height: height
        };
        break;
    }
    }

    return {
        _allowEditing: !isNameReadOnly(state),
        _audioTrack,
        _connectionIndicatorAutoHideEnabled:
        Boolean(state['features/base/config'].connectionIndicators?.autoHide ?? true),
        _connectionIndicatorDisabled: _isMobile
            || Boolean(state['features/base/config'].connectionIndicators?.disabled),
        _currentLayout,
        _defaultLocalDisplayName: interfaceConfig.DEFAULT_LOCAL_DISPLAY_NAME,
        _disableLocalVideoFlip: Boolean(disableLocalVideoFlip),
        _isHidden: isLocal && iAmRecorder && !iAmSipGateway,
        _isAudioOnly: Boolean(state['features/base/audio-only'].enabled),
        _isCurrentlyOnLargeVideo: state['features/large-video']?.participantId === id,
        _isDominantSpeakerDisabled: interfaceConfig.DISABLE_DOMINANT_SPEAKER_INDICATOR,
        _isMobile,
        _isMobilePortrait,
        _isScreenSharing: _videoTrack?.videoType === 'desktop',
        _isTestModeEnabled: isTestModeEnabled(state),
        _isVideoPlayable: id && isVideoPlayable(state, id),
        _indicatorIconSize: NORMAL,
        _localFlipX: Boolean(localFlipX),
        _participant: participant,
        _participantCountMoreThan2: getParticipantCount(state) > 2,
        _startSilent: Boolean(startSilent),
        _videoTrack,
        _volume: isLocal ? undefined : id ? participantsVolume[id] : undefined,
        ...size
    };
}

export default connect(_mapStateToProps)(Thumbnail);
